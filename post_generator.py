import os
import glob
import markdown

# HTML Layout Wrapper
HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; max-width: 750px; margin: 40px auto; padding: 0 20px; color: #222; }}
        h1 {{ color: #111; border-bottom: 2px solid #eaeaea; padding-bottom: 10px; }}
        h2 {{ margin-top: 30px; color: #1a56db; }}
        code {{ background: #f4f4f4; padding: 2px 6px; border-radius: 4px; font-family: monospace; }}
        pre {{ background: #2d3748; color: #fff; padding: 15px; border-radius: 6px; overflow-x: auto; }}
        pre code {{ background: none; color: inherit; padding: 0; }}
        a {{ color: #1a56db; text-decoration: none; }}
        a:hover {{ text-decoration: underline; }}
    </style>
</head>
<body>
    <p><a href="/index.html">&larr; Back to Home</a></p>
    <article>
        {content}
    </article>
</body>
</html>
"""


def build_site():
    os.makedirs("website/website", exist_ok=True)
    os.makedirs("posts", exist_ok=True)

    md = markdown.Markdown(extensions=['fenced_code', 'tables'])

    # Process all .md files in the posts directory
    for md_path in glob.glob("./posts/*.md"):
        filename = os.path.basename(md_path)
        slug = os.path.splitext(filename)[0]

        with open(md_path, "r", encoding="utf-8") as f:
            raw_text = f.read()

        # Convert Markdown text to HTML body
        html_body = md.convert(raw_text)
        md.reset()

        # Determine title from first H1 or filename
        title = slug.replace("-", " ").title()

        full_html = HTML_TEMPLATE.format(title=title, content=html_body)

        output_path = f"./website/pages/{slug}.html"
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(full_html)

        print(f"Compiled: {md_path} -> {output_path}")


if __name__ == "__main__":
    build_site()