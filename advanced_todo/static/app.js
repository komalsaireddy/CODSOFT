/* ==========================================
   To Do List Frontend Javascript Logic
   ========================================== */

// App State
let tasksState = [];
let categoriesState = [];
let currentFilter = 'all'; // all, today, upcoming, overdue, completed, OR a specific category name
let isCategoryFilter = false;
let searchQuery = '';
let sortBy = 'newest';
let tempSubtasks = []; // Subtasks built in the modal for new tasks

// API Base URL
const API_BASE = '/api';

// DOM Elements
const tasksContainer = document.getElementById('tasks-container');
const emptyState = document.getElementById('empty-state');
const categoriesMenu = document.getElementById('categories-menu');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const btnNewTask = document.getElementById('btn-new-task');
const btnEmptyAddTask = document.getElementById('btn-empty-add-task');
const btnAddCategory = document.getElementById('btn-add-category');

// Task Modal Elements
const taskModal = document.getElementById('task-modal');
const taskForm = document.getElementById('task-form');
const modalTitle = document.getElementById('modal-title');
const taskEditId = document.getElementById('task-edit-id');
const taskTitleInput = document.getElementById('task-title-input');
const taskDescInput = document.getElementById('task-desc-input');
const taskCategorySelect = document.getElementById('task-category-select');
const taskPrioritySelect = document.getElementById('task-priority-select');
const taskDueInput = document.getElementById('task-due-input');
const taskStatusSelect = document.getElementById('task-status-select');
const statusGroup = document.getElementById('status-group');
const btnSubmitTaskModal = document.getElementById('btn-submit-task-modal');
const btnCancelTaskModal = document.getElementById('btn-cancel-task-modal');
const btnCloseTaskModal = document.getElementById('btn-close-task-modal');

// Subtask Builder Elements
const subtaskCreatorSection = document.getElementById('subtasks-creator-section');
const subtaskBuilderInput = document.getElementById('subtask-builder-input');
const btnAddBuilderSubtask = document.getElementById('btn-add-builder-subtask');
const builderSubtaskList = document.getElementById('builder-subtask-list');

// Category Modal Elements
const categoryModal = document.getElementById('category-modal');
const categoryForm = document.getElementById('category-form');
const categoryNameInput = document.getElementById('category-name-input');
const btnCancelCategoryModal = document.getElementById('btn-cancel-category-modal');
const btnCloseCategoryModal = document.getElementById('btn-close-category-modal');

// Toast Notification Container
const toastContainer = document.getElementById('toast-container');

// Theme Switcher
const themeToggle = document.getElementById('theme-toggle');

// Data Import/Export
const btnExport = document.getElementById('btn-export');
const btnImportTrigger = document.getElementById('btn-import-trigger');
const importFileInput = document.getElementById('import-file-input');

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadCategories();
    loadTasks();
    loadAnalytics();
    setupEventListeners();
});

// Theme Logic
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i> <span>Dark Mode</span>';
    } else {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
        themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i> <span>Light Mode</span>';
    }
}

function toggleTheme() {
    if (document.body.classList.contains('dark-theme')) {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i> <span>Dark Mode</span>';
        localStorage.setItem('theme', 'light');
        showToast('Switched to Light Mode', 'info');
    } else {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
        themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i> <span>Light Mode</span>';
        localStorage.setItem('theme', 'dark');
        showToast('Switched to Dark Mode', 'info');
    }
}

// --- API INTERACTIONS ---

async function apiRequest(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || 'API request failed');
        }
        
        return await response.json().catch(() => null);
    } catch (error) {
        console.error('API Error:', error);
        showToast(error.message, 'error');
        throw error;
    }
}

// Load tasks from backend with filters
async function loadTasks() {
    let endpoint = '/tasks?';
    
    // Add sorting
    endpoint += `sort_by=${sortBy}`;
    
    // Add filters
    if (isCategoryFilter) {
        endpoint += `&category=${encodeURIComponent(currentFilter)}`;
    } else if (currentFilter !== 'all') {
        // Main categories query won't filter non-standard states, we handle status today/overdue filters in frontend logic or API parameters
        if (currentFilter === 'completed') {
            endpoint += `&status=Completed`;
        } else if (currentFilter === 'today' || currentFilter === 'upcoming' || currentFilter === 'overdue') {
            // Fetch all pending/in_progress tasks and filter locally by date
        }
    }
    
    // Add search
    if (searchQuery) {
        endpoint += `&search=${encodeURIComponent(searchQuery)}`;
    }
    
    try {
        let tasks = await apiRequest(endpoint);
        
        // Local filtering for due date types
        if (!isCategoryFilter) {
            const now = new Date();
            const todayStr = now.toISOString().slice(0, 10);
            
            if (currentFilter === 'today') {
                tasks = tasks.filter(t => t.due_date && t.due_date.slice(0, 10) === todayStr && t.status !== 'Completed');
            } else if (currentFilter === 'upcoming') {
                tasks = tasks.filter(t => t.due_date && t.due_date.slice(0, 10) > todayStr && t.status !== 'Completed');
            } else if (currentFilter === 'overdue') {
                const nowStr = now.toISOString().slice(0, 16);
                tasks = tasks.filter(t => t.due_date && t.due_date < nowStr && t.status !== 'Completed');
            }
        }
        
        tasksState = tasks;
        renderTasksList();
    } catch (err) {
        // Error already displayed in Toast
    }
}

async function loadCategories() {
    try {
        const categories = await apiRequest('/categories');
        categoriesState = categories;
        renderCategoriesList();
        populateCategorySelect();
    } catch (err) {}
}

async function loadAnalytics() {
    try {
        const analytics = await apiRequest('/analytics');
        updateDashboardStats(analytics);
        updateInsightsCharts(analytics);
    } catch (err) {}
}

// --- RENDER FUNCTIONS ---

function renderTasksList() {
    tasksContainer.innerHTML = '';
    
    if (tasksState.length === 0) {
        tasksContainer.appendChild(emptyState);
        emptyState.style.display = 'flex';
        document.getElementById('task-list-count').textContent = '0 tasks';
        return;
    }
    
    emptyState.style.display = 'none';
    document.getElementById('task-list-count').textContent = `${tasksState.length} task${tasksState.length > 1 ? 's' : ''}`;
    
    tasksState.forEach(task => {
        const card = document.createElement('div');
        card.className = `task-card glass-card ${task.status === 'Completed' ? 'completed' : ''}`;
        card.setAttribute('data-id', task.id);
        
        // Due Date styling & calculation
        let dueDateHtml = '';
        let isOverdue = false;
        if (task.due_date) {
            const d = new Date(task.due_date);
            const now = new Date();
            isOverdue = d < now && task.status !== 'Completed';
            
            const options = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
            const formattedDate = d.toLocaleDateString(undefined, options);
            
            dueDateHtml = `
                <div class="meta-pill ${isOverdue ? 'pill-overdue' : ''}">
                    <i class="fa-regular fa-clock"></i>
                    <span>${formattedDate}${isOverdue ? ' (Overdue)' : ''}</span>
                </div>
            `;
        }
        
        // Progress HTML
        const progressHtml = task.subtasks && task.subtasks.length > 0 ? `
            <div class="card-progress-bar">
                <span>Checklist: ${task.progress}%</span>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width: ${task.progress}%"></div>
                </div>
            </div>
        ` : '';
        
        // Checklist items
        let checklistHtml = '';
        if (task.subtasks && task.subtasks.length > 0) {
            const subtaskItemsHtml = task.subtasks.map(sub => `
                <li class="subtask-item ${sub.completed ? 'completed' : ''}" data-sub-id="${sub.id}">
                    <input type="checkbox" class="subtask-checkbox" ${sub.completed ? 'checked' : ''} 
                        onclick="handleSubtaskToggle(${sub.id}, this.checked)">
                    <span>${escapeHTML(sub.title)}</span>
                    <button class="subtask-delete-btn" onclick="handleSubtaskDelete(${sub.id})">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </li>
            `).join('');
            
            checklistHtml = `
                <div class="checklist-wrapper">
                    <div class="checklist-title">
                        <span>Checklist Steps</span>
                    </div>
                    <ul class="subtasks-list">
                        ${subtaskItemsHtml}
                    </ul>
                </div>
            `;
        }
        
        // Card Content
        card.innerHTML = `
            <div class="task-card-main">
                <label class="checkbox-container">
                    <input type="checkbox" ${task.status === 'Completed' ? 'checked' : ''} 
                        onclick="handleTaskCompleteToggle(${task.id}, '${task.status}')">
                    <span class="checkmark"></span>
                </label>
                
                <div class="task-card-content">
                    <h3 class="task-title">${escapeHTML(task.title)}</h3>
                    ${task.description ? `<p class="task-desc">${escapeHTML(task.description)}</p>` : ''}
                    
                    <div class="task-meta">
                        <div class="meta-pill pill-${task.priority.toLowerCase()}">
                            <i class="fa-solid fa-circle-exclamation"></i>
                            <span>${task.priority}</span>
                        </div>
                        <div class="meta-pill">
                            <i class="fa-solid fa-tag"></i>
                            <span>${escapeHTML(task.category)}</span>
                        </div>
                        ${dueDateHtml}
                    </div>
                </div>
                
                <div class="task-actions">
                    <button class="btn-icon" onclick="openEditTaskModal(${task.id})" title="Edit Task">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn-icon" onclick="handleTaskDelete(${task.id})" title="Delete Task" style="color: var(--danger)">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
            
            ${progressHtml}
            ${checklistHtml}
            
            <div class="card-subtask-quick-add">
                <input type="text" placeholder="Add a step..." onkeypress="handleQuickSubadd(event, ${task.id}, this)">
            </div>
        `;
        
        tasksContainer.appendChild(card);
    });
}

function renderCategoriesList() {
    categoriesMenu.innerHTML = '';
    
    categoriesState.forEach(cat => {
        const isDefault = ["General", "Work", "Personal", "Shopping", "Health"].includes(cat);
        const li = document.createElement('li');
        li.className = `menu-item ${currentFilter === cat && isCategoryFilter ? 'active' : ''}`;
        li.setAttribute('data-filter-cat', cat);
        
        li.innerHTML = `
            <i class="fa-solid fa-hashtag"></i>
            <span>${escapeHTML(cat)}</span>
            ${!isDefault ? `
                <button class="btn-icon category-delete-btn" onclick="handleCategoryDelete(event, '${cat}')" title="Delete Category">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            ` : ''}
        `;
        
        li.addEventListener('click', (e) => {
            if (e.target.closest('.category-delete-btn')) return;
            selectFilter(cat, true);
        });
        
        categoriesMenu.appendChild(li);
    });
}

function populateCategorySelect() {
    taskCategorySelect.innerHTML = '';
    categoriesState.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        taskCategorySelect.appendChild(option);
    });
}

function updateDashboardStats(data) {
    document.getElementById('stat-active-count').textContent = data.status.Pending + data.status.In_Progress;
    document.getElementById('stat-overdue-count').textContent = data.overdue;
    document.getElementById('stat-completed-count').textContent = data.status.Completed;
    
    // Completion Bar & percentage
    const completionPct = data.total > 0 ? Math.round((data.status.Completed / data.total) * 100) : 0;
    document.getElementById('stat-completion-pct').textContent = `${completionPct}%`;
    document.getElementById('stat-completion-bar').style.width = `${completionPct}%`;
    
    // Badge filters update
    document.getElementById('badge-all').textContent = data.total;
    document.getElementById('badge-overdue').textContent = data.overdue;
    document.getElementById('badge-completed').textContent = data.status.Completed;
    
    // Quick calculate badges for Today & Upcoming locally
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    
    // We fetch these counts using temporary client evaluation from all active tasks
    apiRequest('/tasks').then(all => {
        const todayCount = all.filter(t => t.due_date && t.due_date.slice(0, 10) === todayStr && t.status !== 'Completed').length;
        const upcomingCount = all.filter(t => t.due_date && t.due_date.slice(0, 10) > todayStr && t.status !== 'Completed').length;
        document.getElementById('badge-today').textContent = todayCount;
        document.getElementById('badge-upcoming').textContent = upcomingCount;
    });
}

function updateInsightsCharts(data) {
    // Total label
    document.getElementById('chart-total-text').textContent = data.total;
    
    // Donut Segments setup
    // Perimeter = 2 * PI * R (251.2 for R=40)
    const perimeter = 251.2;
    
    const high = data.priority.High;
    const medium = data.priority.Medium;
    const low = data.priority.Low;
    
    document.getElementById('legend-high-val').textContent = high;
    document.getElementById('legend-medium-val').textContent = medium;
    document.getElementById('legend-low-val').textContent = low;
    
    const donutHigh = document.querySelector('.donut-high');
    const donutMedium = document.querySelector('.donut-medium');
    const donutLow = document.querySelector('.donut-low');
    
    if (data.total === 0) {
        donutHigh.setAttribute('stroke-dasharray', `0 ${perimeter}`);
        donutMedium.setAttribute('stroke-dasharray', `0 ${perimeter}`);
        donutLow.setAttribute('stroke-dasharray', `0 ${perimeter}`);
        return;
    }
    
    const highPct = high / data.total;
    const mediumPct = medium / data.total;
    const lowPct = low / data.total;
    
    const highLen = highPct * perimeter;
    const mediumLen = mediumPct * perimeter;
    const lowLen = lowPct * perimeter;
    
    donutHigh.setAttribute('stroke-dasharray', `${highLen} ${perimeter}`);
    
    donutMedium.setAttribute('stroke-dasharray', `${mediumLen} ${perimeter}`);
    donutMedium.setAttribute('stroke-dashoffset', `-${highLen}`);
    
    donutLow.setAttribute('stroke-dasharray', `${lowLen} ${perimeter}`);
    donutLow.setAttribute('stroke-dashoffset', `-${highLen + mediumLen}`);
    
    // Horizontal Bar Chart: Category distribution
    const categoryBars = document.getElementById('category-bars');
    categoryBars.innerHTML = '';
    
    const entries = Object.entries(data.category).sort((a, b) => b[1] - a[1]);
    
    if (entries.length === 0) {
        categoryBars.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 10px 0;">No category data</div>';
        return;
    }
    
    const maxVal = Math.max(...entries.map(e => e[1]));
    
    entries.slice(0, 5).forEach(([cat, count]) => {
        const pct = maxVal > 0 ? (count / maxVal) * 100 : 0;
        const row = document.createElement('div');
        row.className = 'category-bar-row';
        row.innerHTML = `
            <div class="category-bar-label">
                <span>${escapeHTML(cat)}</span>
                <span>${count} task${count > 1 ? 's' : ''}</span>
            </div>
            <div class="category-bar">
                <div class="category-bar-fill" style="width: 0%"></div>
            </div>
        `;
        categoryBars.appendChild(row);
        
        // Animate bar fill
        setTimeout(() => {
            row.querySelector('.category-bar-fill').style.width = `${pct}%`;
        }, 50);
    });
}

// --- FILTER SWITCHING ---

function selectFilter(filterVal, isCat = false) {
    currentFilter = filterVal;
    isCategoryFilter = isCat;
    
    // Remove active state from menu
    document.querySelectorAll('.sidebar-menu .menu-item').forEach(el => el.classList.remove('active'));
    
    // Set active state
    if (isCat) {
        const activeItem = Array.from(categoriesMenu.children).find(li => li.getAttribute('data-filter-cat') === filterVal);
        if (activeItem) activeItem.classList.add('active');
        document.getElementById('task-list-title').textContent = `${filterVal} Tasks`;
    } else {
        const activeItem = document.querySelector(`.sidebar-menu [data-filter="${filterVal}"]`);
        if (activeItem) activeItem.classList.add('active');
        
        let title = 'All Tasks';
        if (filterVal === 'today') title = 'Tasks Due Today';
        if (filterVal === 'upcoming') title = 'Upcoming Tasks';
        if (filterVal === 'overdue') title = 'Overdue Tasks';
        if (filterVal === 'completed') title = 'Completed Tasks';
        document.getElementById('task-list-title').textContent = title;
    }
    
    loadTasks();
}

// --- EVENT HANDLERS ---

function setupEventListeners() {
    // Search input (with brief debounce)
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            searchQuery = e.target.value.trim();
            loadTasks();
        }, 250);
    });
    
    // Sort Select
    sortSelect.addEventListener('change', (e) => {
        sortBy = e.target.value;
        loadTasks();
    });
    
    // Sidebar Quick Filters
    document.querySelectorAll('.sidebar-menu [data-filter]').forEach(item => {
        item.addEventListener('click', () => {
            selectFilter(item.getAttribute('data-filter'), false);
        });
    });
    
    // New Task Modals triggers
    btnNewTask.addEventListener('click', () => openNewTaskModal());
    btnEmptyAddTask.addEventListener('click', () => openNewTaskModal());
    btnCancelTaskModal.addEventListener('click', closeTaskModal);
    btnCloseTaskModal.addEventListener('click', closeTaskModal);
    
    // Add Subtask Builder in Modal
    btnAddBuilderSubtask.addEventListener('click', addBuilderSubtask);
    subtaskBuilderInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addBuilderSubtask();
        }
    });
    
    // Form submit task
    taskForm.addEventListener('submit', handleTaskFormSubmit);
    
    // Category Modal triggers
    btnAddCategory.addEventListener('click', () => {
        categoryModal.classList.add('show');
        categoryNameInput.focus();
    });
    btnCancelCategoryModal.addEventListener('click', closeCategoryModal);
    btnCloseCategoryModal.addEventListener('click', closeCategoryModal);
    categoryForm.addEventListener('submit', handleCategoryFormSubmit);
    
    // Theme Toggle
    themeToggle.addEventListener('click', toggleTheme);
    
    // Export Data
    btnExport.addEventListener('click', exportData);
    
    // Import Data triggers
    btnImportTrigger.addEventListener('click', () => importFileInput.click());
    importFileInput.addEventListener('change', importData);
}

// --- TASK CRUD OPERATIONS ---

function openNewTaskModal() {
    modalTitle.textContent = "Create New Task";
    taskEditId.value = '';
    taskForm.reset();
    tempSubtasks = [];
    renderBuilderSubtasks();
    statusGroup.style.display = 'none';
    subtaskCreatorSection.style.display = 'block';
    btnSubmitTaskModal.textContent = "Create Task";
    
    taskModal.classList.add('show');
    taskTitleInput.focus();
}

async function openEditTaskModal(id) {
    try {
        const task = await apiRequest(`/tasks/${id}`);
        modalTitle.textContent = "Edit Task";
        taskEditId.value = task.id;
        taskTitleInput.value = task.title;
        taskDescInput.value = task.description || '';
        taskCategorySelect.value = task.category;
        taskPrioritySelect.value = task.priority;
        taskDueInput.value = task.due_date || '';
        taskStatusSelect.value = task.status;
        
        statusGroup.style.display = 'block';
        subtaskCreatorSection.style.display = 'none'; // Hide subtask checklist builder during direct edits
        btnSubmitTaskModal.textContent = "Save Changes";
        
        taskModal.classList.add('show');
        taskTitleInput.focus();
    } catch (err) {}
}

function closeTaskModal() {
    taskModal.classList.remove('show');
}

function addBuilderSubtask() {
    const val = subtaskBuilderInput.value.trim();
    if (!val) return;
    tempSubtasks.push(val);
    subtaskBuilderInput.value = '';
    renderBuilderSubtasks();
    subtaskBuilderInput.focus();
}

function removeBuilderSubtask(index) {
    tempSubtasks.splice(index, 1);
    renderBuilderSubtasks();
}

function renderBuilderSubtasks() {
    builderSubtaskList.innerHTML = '';
    tempSubtasks.forEach((sub, idx) => {
        const li = document.createElement('li');
        li.className = 'builder-subtask-item';
        li.innerHTML = `
            <span>${escapeHTML(sub)}</span>
            <button type="button" class="btn-icon" onclick="removeBuilderSubtask(${idx})" style="color: var(--danger)">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;
        builderSubtaskList.appendChild(li);
    });
}

async function handleTaskFormSubmit(e) {
    e.preventDefault();
    const id = taskEditId.value;
    const title = taskTitleInput.value.trim();
    const description = taskDescInput.value.trim();
    const category = taskCategorySelect.value;
    const priority = taskPrioritySelect.value;
    const due_date = taskDueInput.value || null;
    
    if (!title) return;
    
    const payload = {
        title,
        description,
        category,
        priority,
        due_date
    };
    
    try {
        if (id) {
            // Edit task
            payload.status = taskStatusSelect.value;
            await apiRequest(`/tasks/${id}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            showToast('Task updated successfully', 'success');
        } else {
            // New task
            payload.subtasks = tempSubtasks;
            await apiRequest('/tasks', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            showToast('Task created successfully', 'success');
        }
        
        closeTaskModal();
        loadTasks();
        loadAnalytics();
    } catch (err) {}
}

async function handleTaskDelete(id) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
        await apiRequest(`/tasks/${id}`, { method: 'DELETE' });
        showToast('Task deleted successfully', 'success');
        loadTasks();
        loadAnalytics();
    } catch (err) {}
}

async function handleTaskCompleteToggle(id, currentStatus) {
    try {
        const task = await apiRequest(`/tasks/${id}`);
        const newStatus = currentStatus === 'Completed' ? 'Pending' : 'Completed';
        
        const payload = {
            title: task.title,
            description: task.description,
            category: task.category,
            priority: task.priority,
            due_date: task.due_date,
            status: newStatus
        };
        
        await apiRequest(`/tasks/${id}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        
        showToast(`Task marked as ${newStatus}`, 'success');
        loadTasks();
        loadAnalytics();
    } catch (err) {}
}

// --- SUBTASK API OPERATIONS ---

async function handleSubtaskToggle(subId, isChecked) {
    try {
        await apiRequest(`/subtasks/${subId}/toggle?completed=${isChecked}`, {
            method: 'PUT'
        });
        loadTasks();
        loadAnalytics();
    } catch (err) {}
}

async function handleSubtaskDelete(subId) {
    try {
        await apiRequest(`/subtasks/${subId}`, { method: 'DELETE' });
        showToast('Subtask deleted', 'success');
        loadTasks();
        loadAnalytics();
    } catch (err) {}
}

async function handleQuickSubadd(e, taskId, inputEl) {
    if (e.key !== 'Enter') return;
    const title = inputEl.value.trim();
    if (!title) return;
    
    try {
        await apiRequest(`/tasks/${taskId}/subtasks`, {
            method: 'POST',
            body: JSON.stringify({ title })
        });
        inputEl.value = '';
        showToast('Subtask added', 'success');
        loadTasks();
        loadAnalytics();
    } catch (err) {}
}

// --- CATEGORY CRUD OPERATIONS ---

function closeCategoryModal() {
    categoryModal.classList.remove('show');
}

async function handleCategoryFormSubmit(e) {
    e.preventDefault();
    const name = categoryNameInput.value.trim();
    if (!name) return;
    
    try {
        await apiRequest('/categories', {
            method: 'POST',
            body: JSON.stringify({ name })
        });
        showToast('Category created successfully', 'success');
        closeCategoryModal();
        categoryForm.reset();
        loadCategories();
    } catch (err) {}
}

async function handleCategoryDelete(e, name) {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete category "${name}"? Tasks in this category will be re-assigned to "General".`)) return;
    
    try {
        await apiRequest(`/categories/${encodeURIComponent(name)}`, { method: 'DELETE' });
        showToast('Category deleted', 'success');
        
        if (currentFilter === name && isCategoryFilter) {
            selectFilter('all', false);
        } else {
            loadCategories();
            loadTasks();
        }
    } catch (err) {}
}

// --- BACKUP IMPORT & EXPORT ---

async function exportData() {
    try {
        const data = await apiRequest('/export');
        const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute('href', jsonString);
        downloadAnchor.setAttribute('download', `todolist_backup_${new Date().toISOString().slice(0,10)}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        showToast('Export file downloaded', 'success');
    } catch (err) {}
}

async function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = JSON.parse(event.target.result);
            await apiRequest('/import', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            showToast('Backup imported successfully!', 'success');
            
            // Reload entire state
            currentFilter = 'all';
            isCategoryFilter = false;
            loadCategories();
            loadTasks();
            loadAnalytics();
        } catch (err) {
            showToast('Invalid backup file structure', 'error');
        }
    };
    reader.readAsText(file);
    importFileInput.value = ''; // Reset file input
}

// --- UTILITY FUNCTIONS ---

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconClass = 'fa-circle-info';
    if (type === 'success') iconClass = 'fa-circle-check';
    if (type === 'error') iconClass = 'fa-circle-xmark';
    
    toast.innerHTML = `
        <i class="fa-solid ${iconClass}"></i>
        <span>${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    
    // Trigger slide-in
    setTimeout(() => {
        toast.classList.add('toast-fade-out');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}
