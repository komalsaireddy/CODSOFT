# To Do List — Apple-Inspired Tasks Dashboard

A premium, minimalist To-Do List application and productivity tracking dashboard designed with an Apple-like aesthetic. It features a Python backend using FastAPI and SQLite, paired with a clean, native-feeling frontend built using HTML, Vanilla CSS, and JavaScript.

---

## 🎨 Key Features

- **Apple Minimalist UI**: OLED-friendly pitch black background in Dark Mode, native system fonts, and rounded card containers.
- **Circular Reminders Checkboxes**: Checkboxes styled as perfect circles with border colors matching the task's priority level. They animate smoothly to green upon completion.
- **Productivity Insights**:
  - **Completion Rate Indicator**: Real-time ratio of completed tasks to total tasks.
  - **Priority Donut Chart**: A lightweight SVG donut chart showing the breakdown of High, Medium, and Low priority tasks.
  - **Category Task Load**: Visual distribution bars indicating task volume per category.
- **Nested Checklists**: Create multiple subtasks for any task. Progress updates automatically as items are checked off.
- **Automatic Port Selector**: Scans ports dynamically to bind the server to the first available port (preventing address conflicts) and automatically opens your default browser.
- **Data Persistence**: Uses Python's built-in `sqlite3` engine for local storage.
- **Backup Export & Import**: Save your task logs to a `todolist_backup.json` file and restore them at any time.
- **Theme Toggle**: Fast toggle between Dark Mode and Light Mode with system setting memory.

---

## 📂 Project Structure

```
advanced_todo/
├── database.py       # SQLite connection and database query CRUD methods
├── main.py           # FastAPI application and REST endpoints
├── test_app.py       # Unittests for database CRUD, progress math, and cascades
├── requirements.txt  # Project dependencies
├── README.md         # This manual
└── static/           # Frontend Single Page App assets
    ├── index.html    # Layout and modal structures
    ├── style.css     # Apple design system styling
    └── app.js        # UI controller and async API operations
```

---

## 🚀 Getting Started

### Prerequisites
- Python 3.10 or higher.

### 1. Install Dependencies
Navigate to the project directory and install the required packages using pip:
```bash
python -m pip install -r requirements.txt
```

### 2. Run the Application
Start the FastAPI server:
```bash
python main.py
```
Upon startup, the script will output the server URL (e.g., `http://127.0.0.1:8000`) and **automatically open your default web browser** to launch the dashboard.

---

## 🧪 Running Tests
The project contains a test suite for the database logic, including task status overrides and checklist cascade deletions. Run it using:
```bash
python test_app.py
```
