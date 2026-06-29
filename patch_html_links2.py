import sys
import re

def main():
    files_to_check = [
        'hungerstation.html', 'profile.html', 'statistics.html'
    ]

    for file in files_to_check:
        try:
            with open(file, 'r', encoding='utf-8') as f:
                content = f.read()

            content = re.sub(r'\s*<a href="kitchen-production\.html" class="nav-item">.*?<\/a>', '', content, flags=re.DOTALL)

            with open(file, 'w', encoding='utf-8') as f:
                f.write(content)
        except Exception as e:
            print(f"Error processing {file}: {e}")

    print("Successfully removed remaining kitchen-production links")

if __name__ == "__main__":
    main()
