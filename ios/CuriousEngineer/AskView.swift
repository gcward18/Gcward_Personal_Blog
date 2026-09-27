import SwiftUI

struct AskView: View {
    let article: Article
    @EnvironmentObject private var session: AuthorSession
    @State private var messages: [Message] = []
    @State private var question = ""
    @State private var busy = false
    @State private var error: String?
    @State private var requestTask: Task<Void, Never>?
    var body: some View {
        VStack(spacing: 12) {
            Text(article.title).font(.headline).padding(.horizontal)
            if session.token == nil {
                ContentUnavailableView("Ask with Bedrock", systemImage: "bubble.left.and.bubble.right",
                                       description: Text("Sign in with an existing author account to ask questions about this article. Reader access is planned for later."))
                Button(session.signingIn ? "Signing in…" : "Sign in") { Task { await session.signIn() } }
                    .buttonStyle(.borderedProminent).disabled(session.signingIn)
                if let error = session.error { Text(error).foregroundStyle(.red).padding() }
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 16) {
                            if messages.isEmpty {
                                Text("Answers use this article as context and may contain mistakes.").foregroundStyle(.secondary)
                                Button("Explain the main idea") { question = "Explain the main idea in simple terms." }
                                Button("Quiz me") { question = "Ask me one question to check my understanding." }
                            }
                            ForEach(messages) { message in
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(message.role == "user" ? "You" : "Assistant").font(.caption.bold())
                                    Text(message.content).textSelection(.enabled)
                                }.padding().frame(maxWidth: .infinity, alignment: .leading)
                                    .background(message.role == "user" ? Color.teal.opacity(0.12) : Color.secondary.opacity(0.08))
                                    .clipShape(RoundedRectangle(cornerRadius: 12)).id(message.id)
                            }
                            if busy { ProgressView("Thinking…") }
                        }.padding()
                    }.onChange(of: messages.count) { _, _ in
                        if let id = messages.last?.id { withAnimation { proxy.scrollTo(id, anchor: .bottom) } }
                    }
                }
                if let error { Text(error).font(.footnote).foregroundStyle(.red).padding(.horizontal) }
                HStack(alignment: .bottom) {
                    TextField("Ask about this article", text: $question, axis: .vertical).lineLimit(1...5)
                        .textFieldStyle(.roundedBorder).disabled(busy)
                    Button { requestTask = Task { await send() } } label: { Image(systemName: "arrow.up.circle.fill").font(.title) }
                        .accessibilityLabel("Send question")
                        .disabled(busy || question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || question.count > 4000)
                }.padding()
                if question.count > 4000 { Text("Keep your question under 4,000 characters.").font(.caption) }
            }
        }
        .navigationTitle("Ask").navigationBarTitleDisplayMode(.inline)
        .toolbar { if session.token != nil { Button("Sign out") { requestTask?.cancel(); session.signOut(); messages = [] }.disabled(busy) } }
        .onDisappear { requestTask?.cancel() }
    }
    @MainActor private func send() async {
        guard !busy, let token = session.token, let config = session.configuration else { return }
        let text = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text.count <= 4000 else { return }
        busy = true; error = nil
        let history = messages
        messages.append(Message(role: "user", content: text)); question = ""
        defer { busy = false }
        do {
            let answer = try await BlogService().ask(article: article, question: text, history: history, token: token, endpoint: config.assistantApiUrl)
            try Task.checkCancellation()
            messages.append(Message(role: "assistant", content: answer))
        } catch {
            messages = history
            question = text
            if !Task.isCancelled { self.error = error.localizedDescription }
        }
    }
}
