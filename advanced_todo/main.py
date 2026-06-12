from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel, Field
from typing import List, Optional
import os
import uvicorn
import threading
import webbrowser
import time

from database import (
    init_db,
    create_task,
    get_tasks,
    get_task,
    update_task,
    delete_task,
    add_subtask,
    toggle_subtask,
    delete_subtask,
    get_categories,
    add_category,
    delete_category,
    get_all_data_for_export,
    import_all_data
)

app = FastAPI(title="Advanced To-Do API")

# --- PYDANTIC SCHEMAS ---

class SubtaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)

class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=150)
    description: Optional[str] = None
    due_date: Optional[str] = None
    priority: str = "Medium"
    category: str = "General"
    subtasks: Optional[List[str]] = []

class TaskUpdate(BaseModel):
    title: str = Field(..., min_length=1, max_length=150)
    description: Optional[str] = None
    due_date: Optional[str] = None
    priority: str = "Medium"
    status: str = "Pending"
    category: str = "General"

class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)

# --- API ENDPOINTS ---

@app.on_event("startup")
def startup_event():
    # Make sure DB is ready
    init_db()

@app.get("/")
def read_root():
    return RedirectResponse(url="/static/index.html")

# Get Tasks
@app.get("/api/tasks")
def api_get_tasks(
    category: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: Optional[str] = None
):
    try:
        return get_tasks(
            category_filter=category,
            status_filter=status,
            priority_filter=priority,
            search_query=search,
            sort_by=sort_by
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Get single Task
@app.get("/api/tasks/{task_id}")
def api_get_task(task_id: int):
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

# Create Task
@app.post("/api/tasks", status_code=201)
def api_create_task(task: TaskCreate):
    try:
        task_id = create_task(
            title=task.title,
            description=task.description,
            due_date=task.due_date,
            priority=task.priority,
            category=task.category,
            subtasks=task.subtasks
        )
        return {"id": task_id, "message": "Task created successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Update Task
@app.put("/api/tasks/{task_id}")
def api_update_task(task_id: int, task: TaskUpdate):
    # Verify task exists
    existing = get_task(task_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")
    
    success = update_task(
        task_id=task_id,
        title=task.title,
        description=task.description,
        due_date=task.due_date,
        priority=task.priority,
        status=task.status,
        category=task.category
    )
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update task")
    return {"message": "Task updated successfully"}

# Delete Task
@app.delete("/api/tasks/{task_id}")
def api_delete_task(task_id: int):
    # Verify task exists
    existing = get_task(task_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")
        
    success = delete_task(task_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete task")
    return {"message": "Task deleted successfully"}

# Add Subtask
@app.post("/api/tasks/{task_id}/subtasks", status_code=201)
def api_add_subtask(task_id: int, subtask: SubtaskCreate):
    # Verify task exists
    existing = get_task(task_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")
        
    subtask_id = add_subtask(task_id, subtask.title)
    return {"id": subtask_id, "message": "Subtask added successfully"}

# Toggle Subtask
@app.put("/api/subtasks/{subtask_id}/toggle")
def api_toggle_subtask(subtask_id: int, completed: bool):
    success = toggle_subtask(subtask_id, completed)
    if not success:
        raise HTTPException(status_code=404, detail="Subtask not found")
    return {"message": "Subtask status updated successfully"}

# Delete Subtask
@app.delete("/api/subtasks/{subtask_id}")
def api_delete_subtask(subtask_id: int):
    success = delete_subtask(subtask_id)
    if not success:
        raise HTTPException(status_code=404, detail="Subtask not found")
    return {"message": "Subtask deleted successfully"}

# Get Categories
@app.get("/api/categories")
def api_get_categories():
    return get_categories()

# Create Category
@app.post("/api/categories", status_code=201)
def api_create_category(category: CategoryCreate):
    success = add_category(category.name)
    if not success:
        raise HTTPException(status_code=400, detail="Category already exists or is invalid")
    return {"message": "Category created successfully"}

# Delete Category
@app.delete("/api/categories/{name}")
def api_delete_category(name: str):
    success = delete_category(name)
    if not success:
        raise HTTPException(status_code=400, detail="Cannot delete default category or category not found")
    return {"message": "Category deleted successfully"}

# Import/Export API
@app.get("/api/export")
def api_export_data():
    return get_all_data_for_export()

@app.post("/api/import")
def api_import_data(data: dict):
    try:
        import_all_data(data)
        return {"message": "Data imported successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Import failed: {str(e)}")

# Analytics Endpoint
@app.get("/api/analytics")
def api_get_analytics():
    try:
        tasks = get_tasks()
        total_tasks = len(tasks)
        
        # Status counts
        completed = sum(1 for t in tasks if t["status"] == "Completed")
        in_progress = sum(1 for t in tasks if t["status"] == "In Progress")
        pending = sum(1 for t in tasks if t["status"] == "Pending")
        
        # Priority counts
        high_priority = sum(1 for t in tasks if t["priority"] == "High")
        medium_priority = sum(1 for t in tasks if t["priority"] == "Medium")
        low_priority = sum(1 for t in tasks if t["priority"] == "Low")
        
        # Category counts
        category_counts = {}
        for t in tasks:
            cat = t["category"]
            category_counts[cat] = category_counts.get(cat, 0) + 1
            
        # Task progress overview
        avg_progress = int(sum(t["progress"] for t in tasks) / total_tasks) if total_tasks > 0 else 0
        
        # Overdue tasks
        import datetime
        overdue_count = 0
        now_str = datetime.datetime.now().strftime("%Y-%m-%dT%H:%M")
        for t in tasks:
            if t["due_date"] and t["status"] != "Completed" and t["due_date"] < now_str:
                overdue_count += 1
                
        return {
            "total": total_tasks,
            "status": {
                "Completed": completed,
                "In_Progress": in_progress,
                "Pending": pending
            },
            "priority": {
                "High": high_priority,
                "Medium": medium_priority,
                "Low": low_priority
            },
            "category": category_counts,
            "average_progress": avg_progress,
            "overdue": overdue_count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

import socket

def find_free_port(start_port=8000):
    port = start_port
    while True:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', port))
                return port
            except OSError:
                port += 1

# Mount Static Files (after API endpoints so the routes don't get intercepted)
static_path = os.path.join(os.path.dirname(__file__), "static")
if not os.path.exists(static_path):
    os.makedirs(static_path)

app.mount("/static", StaticFiles(directory=static_path), name="static")

if __name__ == "__main__":
    # Initialize the database tables on start
    init_db()
    
    # Dynamically find a free port to prevent winerror 10048 (address in use)
    port = find_free_port(8000)
    print(f"Starting ZenTodo server on http://127.0.0.1:{port}")
    
    # Run browser activation in a background thread to prevent blocking
    def open_browser(p):
        time.sleep(1.0)
        webbrowser.open(f"http://127.0.0.1:{p}")
        
    threading.Thread(target=open_browser, args=(port,), daemon=True).start()
    
    # Launch uvicorn server
    uvicorn.run("main:app", host="127.0.0.1", port=port, reload=False)
