import re
import sys

def main():
    try:
        with open('sql-database.js', 'r', encoding='utf-8') as f:
            content = f.read()

        if "'promotions'" not in content:
             content = content.replace("'inventoryAlertState',", "'inventoryAlertState', 'promotions',")

        # fixing the extra '}' left behind from the regex
        content = content.replace("""            }
            }

            const sysStmt = db.prepare('INSERT OR REPLACE INTO system_data (key, value) VALUES (?, ?)');""", """            }

            const sysStmt = db.prepare('INSERT OR REPLACE INTO system_data (key, value) VALUES (?, ?)');""")

        with open('sql-database.js', 'w', encoding='utf-8') as f:
            f.write(content)

        print("Successfully patched sql-database.js again")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
