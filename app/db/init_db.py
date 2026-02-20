import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

import psycopg2
from app.core.config import settings

def init_db():
    print("Initializing database")
    schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
    
    try:
        conn = psycopg2.connect(settings.DATABASE_URL)
        conn.autocommit = True
        cursor = conn.cursor()
        
        with open(schema_path, "r") as f:
            schema_sql = f.read()
            
        cursor.execute(schema_sql)
        print("Database schema applied successfully.")
        
    except Exception as e:
        print(f"Error initializing database: {e}")
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    init_db()
