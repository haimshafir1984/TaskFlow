window.UI = {
  icon(name) {
    const icons = {
      dashboard: 'M4 13h7V4H4v9Zm9 7h7V4h-7v16ZM4 20h7v-5H4v5Z',
      tasks: 'M9 7h11M9 12h11M9 17h11M4 7l1.5 1.5L8 5M4 12l1.5 1.5L8 10M4 17l1.5 1.5L8 15',
      categories: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
      projects: 'M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v7A2.5 2.5 0 0 1 18.5 18h-13A2.5 2.5 0 0 1 3 15.5v-9Z',
      contacts: 'M16 20v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 20v-2a4 4 0 0 0-3-3.87M15 2.13a4 4 0 0 1 0 7.75',
      customers: 'M3 21V7a2 2 0 0 1 2-2h5V3h4v2h5a2 2 0 0 1 2 2v14H3Zm5-10h3M8 15h3M13 11h3M13 15h3',
      settings: 'M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 1-2 0 1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 1 0-2 1.65 1.65 0 0 0 .6-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 6.3l.06.06A1.65 1.65 0 0 0 9 6.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 1 2 0 1.65 1.65 0 0 0 1 .6 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.34.17.66.37.95.6a1.65 1.65 0 0 1 0 2c-.29.23-.61.43-.95.6Z',
      plus: 'M12 5v14M5 12h14',
      edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z',
      trash: 'M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15',
      check: 'M20 6 9 17l-5-5',
      copy: 'M8 8h10v12H8zM6 16H4V4h12v2',
      save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2ZM7 3v6h8',
      logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
      up: 'M18 15 12 9l-6 6',
      down: 'M6 9l6 6 6-6',
      close: 'M18 6 6 18M6 6l12 12'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name] || icons.tasks}"/></svg>`;
  },

  toastQueue: [],
  toastShowing: false,

  toast(message, options = {}) {
    UI.toastQueue.push({ message, options });
    if (!UI.toastShowing) UI.showNextToast();
  },

  showNextToast() {
    const next = UI.toastQueue.shift();
    if (!next) {
      UI.toastShowing = false;
      return;
    }
    UI.toastShowing = true;
    const toast = document.getElementById('toast');
    clearTimeout(toast._hideTimer);
    toast.innerHTML = '';
    const text = document.createElement('span');
    text.textContent = next.message;
    toast.appendChild(text);
    if (next.options.actionLabel && next.options.onAction) {
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'toast-action';
      action.textContent = next.options.actionLabel;
      action.onclick = () => {
        next.options.onAction();
        toast.classList.remove('show');
        clearTimeout(toast._hideTimer);
        setTimeout(UI.showNextToast, 150);
      };
      toast.appendChild(action);
    }
    toast.classList.add('show');
    toast._hideTimer = setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(UI.showNextToast, 150);
    }, next.options.duration || 2600);
  },

  formatDate(value) {
    if (!value) return '';
    return new Intl.DateTimeFormat('he-IL', { dateStyle: 'short' }).format(new Date(value));
  },

  dateInput(value) {
    if (!value) return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
};
