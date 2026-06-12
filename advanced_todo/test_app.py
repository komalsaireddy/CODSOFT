import os
import unittest
import sqlite3
import database

# Point database module to a test database file
TEST_DB_PATH = os.path.join(os.path.dirname(__file__), "test_todo.db")
database.DB_PATH = TEST_DB_PATH

class TestTodoDatabase(unittest.TestCase):
    
    @classmethod
    def setUpClass(cls):
        # Ensure database is clean
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)
            
    def setUp(self):
        database.init_db()
        
    def tearDown(self):
        # Clean up database tables
        conn = database.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DROP TABLE IF EXISTS subtasks;")
        cursor.execute("DROP TABLE IF EXISTS tasks;")
        cursor.execute("DROP TABLE IF EXISTS categories;")
        conn.commit()
        conn.close()

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)

    def test_category_crud(self):
        # Default categories should exist
        categories = database.get_categories()
        self.assertIn("General", categories)
        self.assertIn("Work", categories)
        
        # Add a category
        success = database.add_category("Fitness")
        self.assertTrue(success)
        self.assertIn("Fitness", database.get_categories())
        
        # Duplicate category should fail
        duplicate_success = database.add_category("Fitness")
        self.assertFalse(duplicate_success)
        
        # Delete custom category
        delete_success = database.delete_category("Fitness")
        self.assertTrue(delete_success)
        self.assertNotIn("Fitness", database.get_categories())
        
        # Protected categories cannot be deleted
        general_delete = database.delete_category("General")
        self.assertFalse(general_delete)

    def test_task_crud(self):
        # Create a task
        task_id = database.create_task(
            title="Read Antigravity docs",
            description="Read the developer instructions for antigravity",
            due_date="2026-06-12T17:00",
            priority="High",
            category="Work"
        )
        self.assertIsNotNone(task_id)
        
        # Get task details
        task = database.get_task(task_id)
        self.assertIsNotNone(task)
        self.assertEqual(task["title"], "Read Antigravity docs")
        self.assertEqual(task["priority"], "High")
        self.assertEqual(task["progress"], 0)
        self.assertEqual(task["status"], "Pending")
        
        # Update task status to In Progress
        success = database.update_task(
            task_id=task_id,
            title="Read Antigravity docs",
            description="Read the developer instructions for antigravity",
            due_date="2026-06-12T17:00",
            priority="High",
            status="In Progress",
            category="Work"
        )
        self.assertTrue(success)
        task = database.get_task(task_id)
        self.assertEqual(task["status"], "In Progress")
        
        # Delete task
        del_success = database.delete_task(task_id)
        self.assertTrue(del_success)
        self.assertIsNone(database.get_task(task_id))

    def test_subtask_progress_tracking(self):
        # Create task with initial subtasks
        task_id = database.create_task(
            title="Project Milestone",
            subtasks=["Task Setup", "Design Phase", "Code Implementation"]
        )
        
        task = database.get_task(task_id)
        self.assertEqual(len(task["subtasks"]), 3)
        self.assertEqual(task["progress"], 0)
        self.assertEqual(task["status"], "Pending")
        
        # Toggle first subtask to completed
        subtask1_id = task["subtasks"][0]["id"]
        success = database.toggle_subtask(subtask1_id, completed=True)
        self.assertTrue(success)
        
        # Progress should be 33% (1/3) and status should change to In Progress
        task = database.get_task(task_id)
        self.assertEqual(task["progress"], 33)
        self.assertEqual(task["status"], "In Progress")
        
        # Toggle second subtask to completed
        subtask2_id = task["subtasks"][1]["id"]
        database.toggle_subtask(subtask2_id, completed=True)
        
        # Progress should be 66% (2/3)
        task = database.get_task(task_id)
        self.assertEqual(task["progress"], 66)
        
        # Toggle third subtask to completed
        subtask3_id = task["subtasks"][2]["id"]
        database.toggle_subtask(subtask3_id, completed=True)
        
        # Progress should be 100% and status should change to Completed
        task = database.get_task(task_id)
        self.assertEqual(task["progress"], 100)
        self.assertEqual(task["status"], "Completed")
        
        # Toggle one back to incomplete
        database.toggle_subtask(subtask1_id, completed=False)
        task = database.get_task(task_id)
        self.assertEqual(task["progress"], 66)
        self.assertEqual(task["status"], "In Progress")

    def test_cascade_delete(self):
        # Verify subtasks are cascading deleted when the parent task is deleted
        task_id = database.create_task(
            title="Parent Task",
            subtasks=["Child Step 1", "Child Step 2"]
        )
        task = database.get_task(task_id)
        subtask_ids = [sub["id"] for sub in task["subtasks"]]
        
        conn = database.get_db_connection()
        cursor = conn.cursor()
        
        # Confirm they exist in DB
        for s_id in subtask_ids:
            cursor.execute("SELECT * FROM subtasks WHERE id = ?;", (s_id,))
            self.assertIsNotNone(cursor.fetchone())
            
        # Delete parent task
        database.delete_task(task_id)
        
        # Confirm they are removed by CASCADE
        for s_id in subtask_ids:
            cursor.execute("SELECT * FROM subtasks WHERE id = ?;", (s_id,))
            self.assertIsNone(cursor.fetchone())
            
        conn.close()

if __name__ == "__main__":
    unittest.main()
