import sys
import glob
import re

def main():
    files_to_check = [
        'index.html', 'pos.html', 'sales.html', 'orders.html', 'returns.html',
        'analytics-bestsellers.html', 'analytics-delivery.html', 'staff.html',
        'permissions.html', 'day-closures.html', 'customers.html'
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

    print("Successfully removed kitchen-production links")

if __name__ == "__main__":
    main()
