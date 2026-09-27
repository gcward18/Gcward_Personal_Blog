import Foundation

struct Article: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let snippet: String
    let date: String
    let category: String
    let tags: [String]
    let content: String
    let url: URL
}
struct Feed: Decodable { let version: Int; let articles: [Article] }
struct AuthorConfiguration: Decodable {
    let mobileClientId: String
    let authorizeUrl: URL
    let tokenUrl: URL
    let assistantApiUrl: URL
}
struct Message: Codable, Identifiable {
    var id = UUID()
    let role: String
    let content: String
    enum CodingKeys: String, CodingKey { case role, content }
}
struct ServiceError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}
struct BlogService {
    static let site = URL(string: Bundle.main.object(forInfoDictionaryKey: "BlogSiteURL") as? String
                          ?? "https://thecuriousengineerblog.dev")!
    let session: URLSession
    init(session: URLSession = .shared) { self.session = session }

    func data(for request: URLRequest) async throws -> Data {
        guard request.url?.scheme == "https" else {
            throw ServiceError(message: "The blog connection requires HTTPS.")
        }
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard (200..<300).contains(response.statusCode) else {
            if response.statusCode == 401 { throw ServiceError(message: "Your session expired. Sign out and sign in again.") }
            if response.statusCode == 403 { throw ServiceError(message: "Ask currently requires an account in the Authors group.") }
            throw ServiceError(message: "The service is unavailable (HTTP \(response.statusCode)). Please try again.")
        }
        return data
    }
    func articles() async throws -> [Article] {
        let request = URLRequest(url: Self.site.appendingPathComponent("api/articles.json"),
                                 cachePolicy: .reloadIgnoringLocalCacheData)
        let data = try await data(for: request)
        let feed: Feed
        do { feed = try JSONDecoder().decode(Feed.self, from: data) }
        catch {
            if String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("<") == true {
                throw ServiceError(message: "The article feed has not been published yet. Please try again after the blog is updated.")
            }
            throw ServiceError(message: "The blog returned an unreadable article feed. Please try again later.")
        }
        guard feed.version == 1 else { throw ServiceError(message: "This feed needs a newer app version.") }
        guard Set(feed.articles.map(\.id)).count == feed.articles.count,
              feed.articles.allSatisfy({ $0.url.scheme == "https" && $0.url.host == Self.site.host }) else {
            throw ServiceError(message: "The article feed contains invalid links or duplicate articles.")
        }
        return feed.articles
    }
    func configuration() async throws -> AuthorConfiguration {
        let data = try await data(for: URLRequest(url: Self.site.appendingPathComponent("author-config.json")))
        let config = try JSONDecoder().decode(AuthorConfiguration.self, from: data)
        guard [config.authorizeUrl, config.tokenUrl, config.assistantApiUrl].allSatisfy({ $0.scheme == "https" }),
              config.authorizeUrl.host == config.tokenUrl.host else {
            throw ServiceError(message: "Invalid sign-in configuration.")
        }
        return config
    }
    func ask(article: Article, question: String, history: [Message], token: String, endpoint: URL) async throws -> String {
        struct Payload: Encodable {
            let mode = "ask"
            let instruction: String
            let article: String
            let messages: [Message]
        }
        struct Answer: Decodable { let feedback: String }
        var request = URLRequest(url: endpoint, timeoutInterval: 60)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(Payload(instruction: question, article: article.content, messages: Array(history.suffix(8))))
        let response = try await data(for: request)
        return try JSONDecoder().decode(Answer.self, from: response).feedback
    }
}
