import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "todo.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create tasks table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        due_date TEXT, -- ISO format text YYYY-MM-DDTHH:MM
        priority TEXT DEFAULT 'Medium', -- Low, Medium, High
        status TEXT DEFAULT 'Pending', -- Pending, In Progress, Completed
        category TEXT DEFAULT 'General',
        progress INTEGER DEFAULT 0 -- Percentage: 0 to 100
    );
    """)
    
    # Create subtasks table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS subtasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        completed INTEGER DEFAULT 0, -- 0 for false, 1 for true
        FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE
    );
    """)
    
    # Create categories table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
    );
    """)
    
    # Seed default categories
    default_categories = ["General", "Work", "Personal", "Shopping", "Health"]
    for cat in default_categories:
        cursor.execute("INSERT OR IGNORE INTO categories (name) VALUES (?);", (cat,))
        
    conn.commit()
    conn.close()

# --- TASK CRUD ---

def create_task(title, description=None, due_date=None, priority="Medium", status="Pending", category="General", subtasks=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
        INSERT INTO tasks (title, description, due_date, priority, status, category, progress)
        VALUES (?, ?, ?, ?, ?, ?, 0);
        """, (title, description, due_date, priority, status, category))
        task_id = cursor.lastrowid
        
        if subtasks:
            for sub_title in subtasks:
                cursor.execute("""
                INSERT INTO subtasks (task_id, title, completed)
                VALUES (?, ?, 0);
                """, (task_id, sub_title))
        
        conn.commit()
        # Recalculate progress if subtasks were added
        if subtasks:
            _recalculate_task_progress(cursor, task_id)
            conn.commit()
            
        return task_id
    finally:
        conn.close()

def get_tasks(category_filter=None, status_filter=None, priority_filter=None, search_query=None, sort_by=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        query = "SELECT * FROM tasks WHERE 1=1"
        params = []
        
        if category_filter:
            query += " AND category = ?"
            params.append(category_filter)
        if status_filter:
            query += " AND status = ?"
            params.append(status_filter)
        if priority_filter:
            query += " AND priority = ?"
            params.append(priority_filter)
        if search_query:
            query += " AND (title LIKE ? OR description LIKE ?)"
            search_param = f"%{search_query}%"
            params.append(search_param)
            params.append(search_param)
            
        # Sorting
        if sort_by == "due_date":
            # Place tasks without due dates at the end
            query += " ORDER BY CASE WHEN due_date IS NULL OR due_date = '' THEN 1 ELSE 0 END, due_date ASC"
        elif sort_by == "priority":
            query += """ ORDER BY 
                CASE priority 
                    WHEN 'High' THEN 1 
                    WHEN 'Medium' THEN 2 
                    WHEN 'Low' THEN 3 
                    ELSE 4 
                END ASC"""
        elif sort_by == "status":
            query += """ ORDER BY 
                CASE status 
                    WHEN 'In Progress' THEN 1 
                    WHEN 'Pending' THEN 2 
                    WHEN 'Completed' THEN 3 
                    ELSE 4 
                END ASC"""
        elif sort_by == "title":
            query += " ORDER BY title COLLATE NOCASE ASC"
        else:
            query += " ORDER BY id DESC" # default sort: newest first
            
        cursor.execute(query, params)
        tasks = [dict(row) for row in cursor.fetchall()]
        
        # Hydrate with subtasks
        for task in tasks:
            cursor.execute("SELECT * FROM subtasks WHERE task_id = ?;", (task["id"],))
            task["subtasks"] = [dict(row) for row in cursor.fetchall()]
            
        return tasks
    finally:
        conn.close()

def get_task(task_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM tasks WHERE id = ?;", (task_id,))
        row = cursor.fetchone()
        if not row:
            return None
        task = dict(row)
        cursor.execute("SELECT * FROM subtasks WHERE task_id = ?;", (task_id,))
        task["subtasks"] = [dict(row) for row in cursor.fetchall()]
        return task
    finally:
        conn.close()

def update_task(task_id, title, description=None, due_date=None, priority="Medium", status="Pending", category="General"):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # If task is marked completed, and there are no subtasks, make progress 100%. If pending, 0%.
        # If there are subtasks, progress is computed from them.
        cursor.execute("SELECT COUNT(*) FROM subtasks WHERE task_id = ?;", (task_id,))
        subtask_count = cursor.fetchone()[0]
        
        progress = 0
        if status == "Completed":
            progress = 100
        elif status == "In Progress":
            progress = 50 # Default middle ground for no-subtask tasks in progress
        else:
            progress = 0
            
        if subtask_count > 0:
            # Let the recalculation handle progress if subtasks exist
            cursor.execute("""
            UPDATE tasks 
            SET title = ?, description = ?, due_date = ?, priority = ?, status = ?, category = ?
            WHERE id = ?;
            """, (title, description, due_date, priority, status, category, task_id))
            _recalculate_task_progress(cursor, task_id)
        else:
            cursor.execute("""
            UPDATE tasks 
            SET title = ?, description = ?, due_date = ?, priority = ?, status = ?, category = ?, progress = ?
            WHERE id = ?;
            """, (title, description, due_date, priority, status, category, progress, task_id))
            
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()

def delete_task(task_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM tasks WHERE id = ?;", (task_id,))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()

# --- SUBTASK OPERATIONS ---

def add_subtask(task_id, title):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
        INSERT INTO subtasks (task_id, title, completed)
        VALUES (?, ?, 0);
        """, (task_id, title))
        subtask_id = cursor.lastrowid
        _recalculate_task_progress(cursor, task_id)
        conn.commit()
        return subtask_id
    finally:
        conn.close()

def toggle_subtask(subtask_id, completed):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Fetch the task_id
        cursor.execute("SELECT task_id FROM subtasks WHERE id = ?;", (subtask_id,))
        row = cursor.fetchone()
        if not row:
            return False
        task_id = row[0]
        
        cursor.execute("""
        UPDATE subtasks
        SET completed = ?
        WHERE id = ?;
        """, (1 if completed else 0, subtask_id))
        
        _recalculate_task_progress(cursor, task_id)
        conn.commit()
        return True
    finally:
        conn.close()

def delete_subtask(subtask_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Fetch the task_id
        cursor.execute("SELECT task_id FROM subtasks WHERE id = ?;", (subtask_id,))
        row = cursor.fetchone()
        if not row:
            return False
        task_id = row[0]
        
        cursor.execute("DELETE FROM subtasks WHERE id = ?;", (subtask_id,))
        _recalculate_task_progress(cursor, task_id)
        conn.commit()
        return True
    finally:
        conn.close()

def _recalculate_task_progress(cursor, task_id):
    # Calculate progress percentage based on completed subtasks
    cursor.execute("SELECT COUNT(*) FROM subtasks WHERE task_id = ?;", (task_id,))
    total = cursor.fetchone()[0]
    if total == 0:
        # If no subtasks, retain task status matching progress (or default to current progress logic)
        return
        
    cursor.execute("SELECT COUNT(*) FROM subtasks WHERE task_id = ? AND completed = 1;", (task_id,))
    completed = cursor.fetchone()[0]
    
    progress = int((completed / total) * 100)
    
    # Auto-update task status based on progress
    if progress == 100:
        status = "Completed"
    elif progress > 0:
        status = "In Progress"
    else:
        status = "Pending"
        
    cursor.execute("""
    UPDATE tasks
    SET progress = ?, status = ?
    WHERE id = ?;
    """, (progress, status, task_id))

# --- CATEGORY OPERATIONS ---

def get_categories():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT name FROM categories ORDER BY name COLLATE NOCASE ASC;")
        return [row["name"] for row in cursor.fetchall()]
    finally:
        conn.close()

def add_category(name):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO categories (name) VALUES (?);", (name.strip(),))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False # Category already exists
    finally:
        conn.close()

def delete_category(name):
    if name in ["General", "Work", "Personal", "Shopping", "Health"]:
        return False # Protect default categories
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Move all tasks in this category to 'General'
        cursor.execute("UPDATE tasks SET category = 'General' WHERE category = ?;", (name,))
        cursor.execute("DELETE FROM categories WHERE name = ?;", (name,))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()

# --- BACKUP / IMPORT-EXPORT ---

def get_all_data_for_export():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM tasks;")
        tasks = [dict(row) for row in cursor.fetchall()]
        
        for task in tasks:
            cursor.execute("SELECT * FROM subtasks WHERE task_id = ?;", (task["id"],))
            task["subtasks"] = [dict(row) for row in cursor.fetchall()]
            
        cursor.execute("SELECT name FROM categories;")
        categories = [row["name"] for row in cursor.fetchall()]
        
        return {
            "categories": categories,
            "tasks": tasks
        }
    finally:
        conn.close()

def import_all_data(data):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Clear existing tables (except default categories)
        cursor.execute("DELETE FROM subtasks;")
        cursor.execute("DELETE FROM tasks;")
        cursor.execute("DELETE FROM categories;")
        
        # Import categories
        categories = data.get("categories", ["General", "Work", "Personal", "Shopping", "Health"])
        for cat in categories:
            cursor.execute("INSERT OR IGNORE INTO categories (name) VALUES (?);", (cat,))
            
        # Import tasks and subtasks
        tasks = data.get("tasks", [])
        for task in tasks:
            cursor.execute("""
            INSERT INTO tasks (id, title, description, due_date, priority, status, category, progress)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                task.get("id"),
                task.get("title"),
                task.get("description"),
                task.get("due_date"),
                task.get("priority", "Medium"),
                task.get("status", "Pending"),
                task.get("category", "General"),
                task.get("progress", 0)
            ))
            
            subtasks = task.get("subtasks", [])
            for sub in subtasks:
                cursor.execute("""
                INSERT INTO subtasks (id, task_id, title, completed)
                VALUES (?, ?, ?, ?);
                """, (
                    sub.get("id"),
                    task.get("id"),
                    sub.get("title"),
                    sub.get("completed", 0)
                ))
                
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()
