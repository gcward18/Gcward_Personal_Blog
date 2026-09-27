# Curious Engineer iPhone companion

Native SwiftUI shell, iOS 17+. Open `CuriousEngineer.xcodeproj` in full Xcode,
select the shared CuriousEngineer scheme and an iPhone simulator, then Run.
There are no third-party iOS dependencies or project generators.

## Architecture

- Home downloads `/api/articles.json` from `BlogSiteURL` in Info.plist. The existing
  Vite/social-page build emits this versioned feed from contributed JSON and the
  core article catalog. Markdown is not copied into the app or separately authored.
- Article uses WKWebView to load the canonical `/pages/{id}/` page, preserving the
  site's Mermaid, KaTeX, code highlighting, images and accessible HTML. Links to
  other pages open externally so the Ask context stays on the selected article.
- Ask submits that article's Markdown and the last eight conversation messages
  to the existing API Gateway `/assistant` route. The new `ask` mode returns only
  feedback; it cannot publish or revise content. Bedrock credentials stay in AWS.
- A separate public Cognito mobile client uses authorization code + S256 PKCE via
  ASWebAuthenticationSession. OAuth state and callback are checked. The ID token
  (required by the existing REST authorizer without scopes) stays in memory only.
  No client secret, AWS key, refresh token or token persistence is used. Relaunch
  or an expired session requires sign-in again. Sign-out clears the app session;
  ephemeral browser authentication avoids reusing a persistent login cookie.
- Existing Authors/premium-group authorization remains in force. Anonymous readers
  can browse, but Ask requires an existing approved author account. This MVP does
  not create public, unauthenticated inference or change author permissions.
- Library and Labs are explicit future-feature tabs. No duplicate content store,
  bookmark sync, user database or lab framework has been introduced.

## Backend and deployment

Deploy the changed `BlogStack` using the repository's existing approved workflow.
The deployment builds the feed, updates the assistant Lambda, creates the mobile
Cognito client and adds `mobileClientId` and `tokenUrl` to `author-config.json`.
No additional API route or model permission is needed. The existing Bedrock model
must be available to the Lambda role in its configured AWS region.

The callback is `curiousengineer://oauth/callback`, registered in CDK and the app.
Keep both in sync if renaming it. Info.plist's `BlogSiteURL` must point to the
matching HTTPS deployment for the feed, reader and runtime auth configuration.
Older deployments without the feed/mobile configuration need deployment first.
A missing feed may return the site's HTML fallback and will show a load error.

For physical devices choose your Apple development team under Signing &
Capabilities, choose an available bundle identifier and enable Developer Mode
on the device as required by Xcode. Simulator builds do not need a team.
No signing identity or provisioning profile is committed. Add an app icon and
complete release/privacy metadata before TestFlight or App Store distribution.

## Validation

```sh
cd frontend
npm run build
node scripts/test-companion-feed.mjs
cd ..
python3 -m unittest tests.unit.test_companion_assistant tests.unit.test_companion_infrastructure -v
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project ios/CuriousEngineer.xcodeproj -scheme CuriousEngineer \
  -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

Validation on the implementation machine: production frontend build, exact feed
source checks for all 10 articles, five isolated assistant tests, compiled Swift
service contract tests (feed decoding, request context/history/auth and failures),
an offline CDK synthesis/authorization test, plist/project-file linting, and a successful Debug simulator build for arm64 and
x86_64 with Xcode 26.6. Physical-device signing and live Cognito/Bedrock calls were
not performed. No AWS infrastructure was deployed by this change. A launch smoke test was
attempted, but the simulator stalled during its initial OS data migration, before
app installation; an interactive UI run remains unverified.

To run the Swift service contracts on macOS from the repository root:
```sh
mkdir -p /tmp/curious-engineer-tests
swiftc -module-cache-path /tmp/curious-engineer-tests/modules \
  ios/CuriousEngineer/BlogService.swift ios/Tests/ServiceContractTests.swift \
  -o /tmp/curious-engineer-tests/service-tests
/tmp/curious-engineer-tests/service-tests frontend/dist/api/articles.json
```

Manual end-to-end check after deployment:
1. Launch Home, search a topic, refresh and open an article with math/diagrams.
2. Follow an external link and return; verify Ask still names the selected article.
3. Tap Ask, cancel sign-in, then sign in with an Authors account and send a question.
4. Ask a follow-up and verify article-specific context. Open another article and
   verify it starts a separate conversation.
5. Test offline Home/reader loading, retry, expired login, a non-Authors account,
   failed inference, and navigating away during a request. Failed questions remain
   in the composer for retry and are not duplicated in conversation history.

Current limits: online article loading, no durable conversations or bookmarks,
no token refresh, and the feed includes full Markdown for the small current blog.
A larger catalog can evolve the versioned feed into a metadata index plus article
payloads. Feed/reader consistency follows the site's deployment/cache lifecycle.

Authentication references:
- https://docs.aws.amazon.com/cognito/latest/developerguide/using-pkce-in-authorization-code.html
- https://developer.apple.com/documentation/authenticationservices/aswebauthenticationsession
