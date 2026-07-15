import os
from dotenv import load_dotenv
from neo4j import GraphDatabase

load_dotenv()

uri = os.getenv("NEO4J_URI")
user = os.getenv("NEO4J_USER")
password = os.getenv("NEO4J_PASSWORD")

try:
    driver = GraphDatabase.driver(uri, auth=(user, password))
    with driver.session() as session:
        # Check Node labels and counts
        result = session.run("MATCH (n) RETURN labels(n) as labels, count(n) as count")
        print("Neo4j Database Node Inventory:")
        for record in result:
            print(f"- Labels: {record['labels']} | Count: {record['count']}")
            
        # Check Relationship types and counts
        result = session.run("MATCH ()-[r]->() RETURN type(r) as type, count(r) as count")
        print("\nNeo4j Database Relationship Inventory:")
        for record in result:
            print(f"- Type: {record['type']} | Count: {record['count']}")
            
    driver.close()
except Exception as e:
    print(f"FAILURE: {e}")
