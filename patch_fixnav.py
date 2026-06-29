import sys

def main():
    try:
        with open('fixnav.js', 'r', encoding='utf-8') as f:
            content = f.read()

        # Update fixnav.js
        content = content.replace(
            '<a href="pos.html" class="nav-item"><i class="ph ph-monitor"></i><span>نقطة البيع (الكاشير)</span></a>\\n                <a href="kitchen.html" class="nav-item"><i class="ph ph-cooking-pot"></i><span>شاشة المطبخ (KDS)</span></a>',
            '<a href="pos.html" class="nav-item"><i class="ph ph-monitor"></i><span>نقطة البيع (الكاشير)</span></a>'
        )

        with open('fixnav.js', 'w', encoding='utf-8') as f:
            f.write(content)

        print("Successfully patched fixnav.js")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
