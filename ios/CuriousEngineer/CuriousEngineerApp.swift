import SwiftUI

@main
struct CuriousEngineerApp: App {
    @StateObject private var session = AuthorSession()
    var body: some Scene {
        WindowGroup {
            TabView {
                HomeView().tabItem { Label("Home", systemImage: "house") }
                NavigationStack {
                    ContentUnavailableView("Your library", systemImage: "bookmark", description: Text("Saved articles will live here in a future update. Browse Home to start reading."))
                        .navigationTitle("Library")
                }.tabItem { Label("Library", systemImage: "bookmark") }
                NavigationStack {
                    ContentUnavailableView("Engineering labs", systemImage: "flask", description: Text("Interactive experiments are planned for a future update."))
                        .navigationTitle("Labs")
                }.tabItem { Label("Labs", systemImage: "flask") }
            }.environmentObject(session).tint(.teal)
        }
    }
}

struct HomeView: View {
    @State private var articles: [Article] = []
    @State private var loading = false
    @State private var error: String?
    @State private var search = ""
    private var filtered: [Article] {
        articles.filter { search.isEmpty || "\($0.title) \($0.category) \($0.tags.joined(separator: " "))".localizedCaseInsensitiveContains(search) }
    }
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Stay curious. Build with intention.").font(.headline)
                    Text("Field notes on software, cloud, and engineering.").foregroundStyle(.secondary)
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red); Button("Try again") { Task { await load() } } }
                }
                ForEach(filtered) { article in
                    NavigationLink(value: article) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(article.category.replacingOccurrences(of: "_", with: " ")).font(.caption).foregroundStyle(.teal)
                            Text(article.title).font(.headline)
                            Text(article.snippet).font(.subheadline).foregroundStyle(.secondary).lineLimit(3)
                            Text(article.date).font(.caption).foregroundStyle(.secondary)
                        }.padding(.vertical, 6)
                    }
                }
                if !loading && error == nil && filtered.isEmpty {
                    Text(search.isEmpty ? "No articles have been published yet." : "No matching articles.")
                }
            }
            .navigationTitle("Curious Engineer")
            .searchable(text: $search, prompt: "Search articles and topics")
            .overlay { if loading && articles.isEmpty { ProgressView("Loading articles…") } }
            .navigationDestination(for: Article.self) { ArticleView(article: $0) }
            .refreshable { await load() }
            .task { if articles.isEmpty { await load() } }
        }
    }
    @MainActor private func load() async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        do { articles = try await BlogService().articles(); error = nil }
        catch is CancellationError { }
        catch { self.error = "Could not load articles. \(error.localizedDescription)" }
    }
}
