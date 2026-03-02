import psycopg2
from psycopg2 import pool
from app.core.config import settings

connection_pool = None

try:
    connection_pool = psycopg2.pool.SimpleConnectionPool(
        1,  # min
        20, # max
        settings.DATABASE_URL
    )
    if connection_pool:
        print("Connection pool created successfully")
        
except psycopg2.Error as e:
    print(f"Error creating connection pool: {e}")

def get_db_connection():
    """
    Yields a database connection from the pool.
    """
    if not connection_pool:
        raise Exception("Database connection pool not initialized")
        
    conn = connection_pool.getconn()
    try:
        yield conn
    finally:
        connection_pool.putconn(conn)
