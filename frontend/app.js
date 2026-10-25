const API_URL = '/api/expenses';
const form = document.getElementById('expenseForm');
const status = document.getElementById('status');
const expenseList = document.getElementById('expenseList');

function addCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = value;
  row.appendChild(cell);
  return cell;
}

async function loadExpenses() {
  try {
    const response = await fetch(API_URL, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Không tải được danh sách chi tiêu.');
    const expenses = await response.json();
    const fragment = document.createDocumentFragment();

    for (const expense of expenses) {
      const row = document.createElement('tr');
      addCell(row, new Date(expense.created_at).toLocaleString('vi-VN'));
      addCell(row, expense.category);
      addCell(row, expense.title);
      addCell(row, Number(expense.amount).toLocaleString('vi-VN'));

      const actionCell = document.createElement('td');
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'btn-delete';
      deleteButton.textContent = 'Xóa';
      deleteButton.addEventListener('click', () => deleteExpense(expense.id));
      actionCell.appendChild(deleteButton);
      row.appendChild(actionCell);
      fragment.appendChild(row);
    }

    expenseList.replaceChildren(fragment);
    status.textContent = '';
  } catch (error) {
    status.textContent = error.message;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const expense = {
    title: String(formData.get('title') || '').trim(),
    amount: Number(formData.get('amount')),
    category: String(formData.get('category') || ''),
  };

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(expense),
    });
    if (!response.ok) throw new Error('Không thể thêm khoản chi. Hãy kiểm tra thông tin nhập.');
    form.reset();
    await loadExpenses();
  } catch (error) {
    status.textContent = error.message;
  }
});

async function deleteExpense(id) {
  if (!window.confirm('Xác nhận xóa khoản chi tiêu này?')) return;
  try {
    const response = await fetch(`${API_URL}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Không thể xóa khoản chi.');
    await loadExpenses();
  } catch (error) {
    status.textContent = error.message;
  }
}

loadExpenses();
