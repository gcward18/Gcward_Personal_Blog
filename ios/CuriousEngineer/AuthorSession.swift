import AuthenticationServices
import CryptoKit
import SwiftUI

@MainActor
final class AuthorSession: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    @Published private(set) var token: String?
    @Published private(set) var configuration: AuthorConfiguration?
    @Published private(set) var signingIn = false
    @Published var error: String?
    private var webSession: ASWebAuthenticationSession?
    private let service = BlogService()
    private let redirect = "curiousengineer://oauth/callback"

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows).first(where: \.isKeyWindow) ?? ASPresentationAnchor()
    }
    func signOut() { token = nil; configuration = nil }
    func signIn() async {
        guard !signingIn else { return }
        signingIn = true
        error = nil
        defer { signingIn = false; webSession = nil }
        do {
            let config = try await service.configuration()
            let verifier = UUID().uuidString + UUID().uuidString
            let state = UUID().uuidString
            let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64EncodedString()
                .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
                .replacingOccurrences(of: "=", with: "")
            var url = URLComponents(url: config.authorizeUrl, resolvingAgainstBaseURL: false)!
            url.queryItems = ["client_id": config.mobileClientId, "response_type": "code",
                              "redirect_uri": redirect, "scope": "openid email", "state": state,
                              "code_challenge_method": "S256", "code_challenge": challenge]
                .map { URLQueryItem(name: $0.key, value: $0.value) }
            let callback: URL = try await withCheckedThrowingContinuation { continuation in
                let session = ASWebAuthenticationSession(url: url.url!, callbackURLScheme: "curiousengineer") { url, error in
                    if let error { continuation.resume(throwing: error) }
                    else if let url { continuation.resume(returning: url) }
                    else { continuation.resume(throwing: URLError(.badServerResponse)) }
                }
                session.presentationContextProvider = self
                session.prefersEphemeralWebBrowserSession = true
                webSession = session
                if !session.start() { continuation.resume(throwing: ServiceError(message: "Could not open sign-in.")) }
            }
            let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
            guard callback.scheme == "curiousengineer", callback.host == "oauth", callback.path == "/callback",
                  items.first(where: { $0.name == "state" })?.value == state,
                  let code = items.first(where: { $0.name == "code" })?.value else {
                throw ServiceError(message: "Sign-in could not be verified. Please try again.")
            }
            var request = URLRequest(url: config.tokenUrl)
            request.httpMethod = "POST"
            request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            let fields = ["grant_type": "authorization_code", "client_id": config.mobileClientId,
                          "code": code, "redirect_uri": redirect, "code_verifier": verifier]
            let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))
            request.httpBody = fields.map { key, value in
                "\(key)=\(value.addingPercentEncoding(withAllowedCharacters: allowed)!)"
            }.joined(separator: "&").data(using: .utf8)
            struct Tokens: Decodable { let id_token: String }
            let data = try await service.data(for: request)
            token = try JSONDecoder().decode(Tokens.self, from: data).id_token
            configuration = config
        } catch let failure as ASWebAuthenticationSessionError where failure.code == .canceledLogin {
            // Cancelling sign-in is an ordinary user action.
        } catch { self.error = error.localizedDescription }
    }
}
