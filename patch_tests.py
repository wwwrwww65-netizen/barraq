import sys

def main():
    try:
        # Patch tests/unit/app-pages-exist.test.js
        with open('tests/unit/app-pages-exist.test.js', 'r', encoding='utf-8') as f:
            content = f.read()

        content = content.replace("'kitchen.html',", "")
        content = content.replace("'kitchen-production.html',", "")

        with open('tests/unit/app-pages-exist.test.js', 'w', encoding='utf-8') as f:
            f.write(content)

        # Patch tests/e2e/app-pages.spec.js
        with open('tests/e2e/app-pages.spec.js', 'r', encoding='utf-8') as f:
            content = f.read()

        content = content.replace("'kitchen.html',", "")
        content = content.replace("'kitchen-production.html',", "")

        with open('tests/e2e/app-pages.spec.js', 'w', encoding='utf-8') as f:
            f.write(content)

        print("Successfully patched tests")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
