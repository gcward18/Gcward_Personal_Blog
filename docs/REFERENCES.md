# Reference Lookup

Use this table to locate the primary design, architecture, and implementation resources used by this project.

## Shared resources

The links in this section identify external files and demos. A link does not make a private Google Drive file public by itself, but anyone granted link access may be able to open it. Before publishing this repository, verify each file's sharing settings and confirm that it contains no credentials, private architecture details, customer data, or other confidential information.

| ID | Resource | Type | Link |
| --- | --- | --- | --- |
| 01 | Resource 01 | Google Drive file | [Open resource 01](https://drive.google.com/file/d/164xK2iywqwb-gbuqPK2G4dmrshgNqSGu/view?usp=sharing) |
| 02 | Resource 02 | Google Drive file | [Open resource 02](https://drive.google.com/file/d/1nS5gzOSH7bopIElz2lCRaIvSbXTTH6FJ/view?usp=sharing) |
| 03 | Resource 03 | Google Drive file | [Open resource 03](https://drive.google.com/file/d/1hXsXFKCkwo50FrdQKn0Nk2WA2Oq4lWmQ/view?usp=sharing) |
| 04 | Resource 04 | Google Drive file | [Open resource 04](https://drive.google.com/file/d/1PbuoV-8LVWuAEILq6i6g9FIlspp0-FGh/view?usp=sharing) |
| 05 | Resource 05 | Google Drive file | [Open resource 05](https://drive.google.com/file/d/1jqc8wW6L4NNf5ZNvDLHsuj_eQBXbjQFc/view?usp=sharing) |
| 06 | Resource 06 | Google Drive file | [Open resource 06](https://drive.google.com/file/d/10oMHZzclAik3GdAQUsccdb8XRJCvyHUP/view?usp=sharing) |
| Slides | Presentation | Google Slides | [Open presentation](https://docs.google.com/presentation/d/1WDXE2-zgfQCeeIU35YdToGobVfcjRzMwqmAyCJeDYG0/edit?usp=sharing) |
| Voice Agent | Source code | GitHub repository | [inside-the-voice-agent](https://github.com/smakubi/inside-the-voice-agent) |
| Voice Agent | Live demo | Vercel application | [Open Voice Agent demo](https://voice-ai-topaz.vercel.app/) |
| AxiomCart | Source code | GitHub repository | [axiomcart-ai-assistant](https://github.com/smakubi/axiomcart-ai-assistant/) |
| AxiomCart | Live demo | Vercel application | [Open AxiomCart demo](https://axiomcart-ai-assistant.vercel.app/) |

## Project references

| Area | Resource | Used for | Link |
| --- | --- | --- | --- |
| Typography | Atkinson Hyperlegible | Primary interface and article typeface | [Braille Institute: Atkinson Hyperlegible](https://www.brailleinstitute.org/freefont/) |
| Typography | Fira Code | Monospaced labels, metadata, navigation accents, and code | [Fira Code on GitHub](https://github.com/tonsky/FiraCode) |
| AWS IAM | Cross-account role access | Core cross-account IAM role workflow and policy model | [AWS IAM tutorial](https://docs.aws.amazon.com/IAM/latest/UserGuide/tutorial_cross-account-with-roles.html) |
| AWS IAM | IAM role trust policies | Defining which principals may assume a destination role | [IAM role trust principals](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_principal.html#principal-role-session) |
| AWS STS | AssumeRole | Temporary cross-account credentials and role sessions | [AssumeRole API](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html) |
| AWS Security | External IDs | Preventing confused-deputy problems with third-party access | [External ID guidance](https://docs.aws.amazon.com/IAM/latest/UserGuide/confused-deputy.html) |
| AWS CDK | IAM constructs | Defining IAM roles, principals, and policies in Python | [AWS CDK IAM API](https://docs.aws.amazon.com/cdk/api/v2/python/aws_cdk.aws_iam.html) |
| AWS CDK | S3 deployments | Uploading compiled frontend assets to a private S3 bucket | [AWS CDK S3 Deployment API](https://docs.aws.amazon.com/cdk/api/v2/python/aws_cdk.aws_s3_deployment.html) |
| AWS CloudFront | Custom error responses | Returning the SPA entry point for direct client-side routes | [CloudFront custom errors](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/custom-error-pages.html) |
| Frontend | React | Component-based user interface | [react.dev](https://react.dev/) |
| Frontend | React Router | Client-side article routing and future flags | [React Router documentation](https://reactrouter.com/) |
| Frontend | Vite | Production compilation and static asset generation | [Vite build guide](https://vite.dev/guide/build.html) |
| Content | React Markdown | Rendering article content stored as Markdown | [React Markdown on GitHub](https://github.com/remarkjs/react-markdown) |
| Diagrams | Mermaid | Rendering architecture and sequence diagrams inside articles | [Mermaid documentation](https://mermaid.js.org/) |

## Project locations

| Concern | Location |
| --- | --- |
| Article content and metadata | `../frontend/src/data/articlesData.js` |
| Main interface and search | `../frontend/src/App.jsx` |
| Theme and design tokens | `../frontend/src/index.css` |
| Article rendering | `../frontend/src/components/ArticleReader.jsx` |
| S3 and CloudFront deployment | `../stacks/blog_stack.py` |
