// Run with BlogService.swift as a standalone executable; no iOS UI SDK needed.
import Foundation

final class StubProtocol: URLProtocol {
    static var handler: ((URLRequest) throws -> (Int, Data))!
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let (status, data) = try Self.handler(request)
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

@main
struct ServiceContractTests {
    static func main() async throws {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        let service = BlogService(session: URLSession(configuration: config))
        let feedData = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
        StubProtocol.handler = { request in
            precondition(request.url?.path == "/api/articles.json")
            return (200, feedData)
        }
        let articles = try await service.articles()
        precondition(!articles.isEmpty)
        StubProtocol.handler = { request in
            precondition(request.httpMethod == "POST")
            precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer test-token")
            // URLSession can convert the original body into a stream.
            var body = request.httpBody ?? Data()
            if let stream = request.httpBodyStream {
                stream.open(); defer { stream.close() }
                var buffer = [UInt8](repeating: 0, count: 4096)
                while stream.hasBytesAvailable {
                    let count = stream.read(&buffer, maxLength: buffer.count)
                    if count <= 0 { break }
                    body.append(contentsOf: buffer.prefix(count))
                }
            }
            let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
            precondition(payload["mode"] as? String == "ask")
            precondition(payload["article"] as? String == articles[0].content)
            precondition((payload["messages"] as? [[String: String]])?.count == 8)
            return (200, Data("{\"feedback\":\"Grounded answer\"}".utf8))
        }
        let history = (0..<12).map { Message(role: $0.isMultiple(of: 2) ? "user" : "assistant", content: "Turn \($0)") }
        let answer = try await service.ask(article: articles[0], question: "Explain", history: history, token: "test-token", endpoint: URL(string: "https://example.com/assistant")!)
        precondition(answer == "Grounded answer")
        for status in [401, 403, 502] {
            StubProtocol.handler = { _ in (status, Data()) }
            do { _ = try await service.articles(); preconditionFailure("Expected HTTP failure") }
            catch let error as ServiceError { precondition(!error.message.isEmpty) }
        }
        StubProtocol.handler = { _ in (200, Data("<html>missing feed</html>".utf8)) }
        do { _ = try await service.articles(); preconditionFailure("Expected malformed feed failure") }
        catch let error as ServiceError { precondition(error.message.contains("not been published")) }
        print("Swift service contracts passed: feed decoding, article context, history, authorization and errors.")
    }
}
