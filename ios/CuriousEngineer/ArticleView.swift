import SwiftUI
import WebKit

struct ArticleView: View {
    let article: Article
    @State private var loading = true
    @State private var error: String?
    @State private var reload = UUID()
    var body: some View {
        VStack(spacing: 0) {
            if let error {
                Text(error).foregroundStyle(.red).padding()
                Button("Reload article") { self.error = nil; loading = true; reload = UUID() }
            }
            ArticleWebView(url: article.url, loading: $loading, error: $error).id(reload)
                .overlay { if loading { ProgressView("Opening article…") } }
            NavigationLink { AskView(article: article) } label: {
                Label("Ask about this article", systemImage: "bubble.left.and.bubble.right")
                    .frame(maxWidth: .infinity).padding()
            }.buttonStyle(.borderedProminent).padding()
        }
        .navigationTitle(article.title).navigationBarTitleDisplayMode(.inline)
        .toolbar { ShareLink(item: article.url) }
    }
}

struct ArticleWebView: UIViewRepresentable {
    let url: URL
    @Binding var loading: Bool
    @Binding var error: String?
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        // Convert SPA link clicks into navigations the native delegate can inspect.
        // Otherwise React Router could change the article without updating Ask.
        let links = WKUserScript(source: """
        document.addEventListener('click', function(event) {
          const link = event.target.closest ? event.target.closest('a[href]') : null;
          if (!link) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          window.location.href = link.href;
        }, true);
        """, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        configuration.userContentController.addUserScript(links)
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.allowsBackForwardNavigationGestures = false
        view.load(URLRequest(url: url))
        return view
    }
    func updateUIView(_ view: WKWebView, context: Context) { context.coordinator.parent = self }
    final class Coordinator: NSObject, WKNavigationDelegate {
        var parent: ArticleWebView
        init(_ parent: ArticleWebView) { self.parent = parent }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { parent.loading = false }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { fail(error) }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { fail(error) }
        private func fail(_ error: Error) {
            parent.loading = false
            parent.error = "Could not open the article. Check your connection and retry."
        }
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = action.request.url else { decisionHandler(.cancel); return }
            // Keep the reader on its selected article so Ask's context never becomes stale.
            if url.scheme == parent.url.scheme && url.host == parent.url.host && url.path == parent.url.path {
                decisionHandler(.allow)
            } else {
                decisionHandler(.cancel)
                if action.targetFrame?.isMainFrame != false && ["https", "http", "mailto"].contains(url.scheme ?? "") {
                    UIApplication.shared.open(url)
                }
            }
        }
    }
}
