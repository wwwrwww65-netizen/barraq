import sys

def main():
    try:
        with open('thermal-receipt-updated.js', 'r', encoding='utf-8') as f:
            content = f.read()

        # Add Savings row html logic
        savings_html = """
            ${(() => {
                if (isNonZeroMoneyDisplay(rSavings)) {
                    return `
                    <div class="total-row savings-row" style="color: #10b981;">
                        <span class="total-label">إجمالي التوفير:</span>
                        <span class="total-value">${rSavings}</span>
                    </div>`;
                }
                return '';
            })()}"""

        content = content.replace(
            '<div class="total-row">\n                <span class="total-label">${rTaxLabel}</span>',
            savings_html.strip() + '\n            <div class="total-row">\n                <span class="total-label">${rTaxLabel}</span>'
        )

        with open('thermal-receipt-updated.js', 'w', encoding='utf-8') as f:
            f.write(content)

        print("Successfully patched thermal-receipt-updated.js again")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
