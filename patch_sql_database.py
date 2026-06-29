import re
import sys

def main():
    try:
        with open('sql-database.js', 'r', encoding='utf-8') as f:
            content = f.read()

        # 1. Add promotions table
        if 'CREATE TABLE IF NOT EXISTS promotions' not in content:
            content = content.replace(
                'CREATE TABLE IF NOT EXISTS day_closures',
                'CREATE TABLE IF NOT EXISTS promotions (\n            id TEXT PRIMARY KEY,\n            data TEXT\n        );\n\n        CREATE TABLE IF NOT EXISTS day_closures'
            )

        # 2. Remove kitchen_tx table
        content = re.sub(r'\s*CREATE TABLE IF NOT EXISTS kitchen_tx \([^)]+\);', '', content)

        # 3. Remove kitchen_tx occurrences
        content = re.sub(r"\s*db\.prepare\('INSERT OR IGNORE INTO kitchen_tx.*?run\(.*?\);", '', content, flags=re.DOTALL)
        content = re.sub(r"\s*\} else if \(key === 'kitchenTx'\) \{.*?\} else \{", ' } else {', content, flags=re.DOTALL)
        content = re.sub(r",\s*kitchenTx:\s*_getAllFromTable\('kitchen_tx'\)", '', content)
        content = re.sub(r"\s*if \(Array\.isArray\(data\.kitchenTx\)\).*?\}", '', content, flags=re.DOTALL)
        content = content.replace(", 'kitchenTx'", "")

        # 4. Add getter and setter for promotions
        promo_funcs = """
// ---------------------------------------------------------
// Promotions
// ---------------------------------------------------------
function savePromotion(promotion) {
    try {
        db.prepare('INSERT OR REPLACE INTO promotions (id, data) VALUES (?, ?)').run(promotion.id, JSON.stringify(promotion));
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

function getPromotions() {
    return _getAllFromTable('promotions');
}

"""
        if 'function getPromotions' not in content:
            content = content.replace(
                '// ---------------------------------------------------------',
                promo_funcs + '// ---------------------------------------------------------',
                1
            ) # Note: we'll place it before the first block, let's refine this to place before export

            # actually better to place before module.exports
            content = content.replace('module.exports = {', promo_funcs + 'module.exports = {')

            # remove duplicate if we did the first replace by mistake
            content = content.replace(promo_funcs + '// ---------------------------------------------------------', '// ---------------------------------------------------------')


        # Add to exports
        if 'savePromotion,' not in content:
            content = content.replace('module.exports = {', 'module.exports = {\n    savePromotion,\n    getPromotions,')

        # 5. Add promotions to SYSTEM_KEYS array to include it in slices/backups.
        if "'promotions'" not in content:
             content = content.replace("'inventoryAlertState',", "'inventoryAlertState', 'promotions',")

        with open('sql-database.js', 'w', encoding='utf-8') as f:
            f.write(content)

        print("Successfully patched sql-database.js")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
