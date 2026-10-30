import './styles.css';
import type { Book } from './task1-types';
import { applyFilters, filterByAuthor, filterByMinYear } from './task3-filters';
import { createBookFromForm } from './task4-integration';
import { filterByTitle, sortBooks } from './task5-utils';
import { BookCatalog } from './task6-classes';
import { Wishlist } from './task7-wishlist';
import { fetchBooks, saveBooks } from './mock-api';

// В каждый момент времени приложение находится ровно в одном состоянии.
// Поле data доступно только при success, а message — только при error.
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string };

let state: AsyncState<Book[]> = { status: 'loading' };
// Ошибка сохранения отдельная: при ней загруженный список должен остаться виден.
let errorMessage = '';
// Не даём запустить два сохранения одновременно.
let saving = false;
// Храним таймер, чтобы новая ошибка могла отменить очистку предыдущей.
let errorTimer: ReturnType<typeof setTimeout> | undefined;
// Избранное, как и раньше, хранит только ID и сохраняется отдельно от книг.
const savedWishlist = localStorage.getItem('wishlist');
const wishlist = new Wishlist(savedWishlist ? JSON.parse(savedWishlist) : []);

const appStatus = document.querySelector('#appStatus') as HTMLDivElement;
const appContent = document.querySelector('#appContent') as HTMLDivElement;
const bookList = document.querySelector('#bookList') as HTMLDivElement;
const wishlistContainer = document.querySelector('#wishlistContainer') as HTMLDivElement;
const form = document.querySelector('#bookForm') as HTMLFormElement;
const filterBtn = document.querySelector('#applyFilters') as HTMLButtonElement;
const authorInput = document.querySelector('#filterAuthor') as HTMLInputElement;
const yearInput = document.querySelector('#filterYear') as HTMLInputElement;
const errorElement = document.querySelector('#errorMessage') as HTMLDivElement;
const searchInput = document.querySelector('#searchInput') as HTMLInputElement;
const sortBySelect = document.querySelector('#sortBy') as HTMLSelectElement;

function showTemporaryError(error: unknown): void {
  // В catch может попасть не только Error, поэтому сначала проверяем тип.
  errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
  render();
  // Если ошибки идут подряд, сообщение должно исчезнуть через 3 секунды
  // после последней ошибки, а не после первой.
  if (errorTimer) clearTimeout(errorTimer);
  errorTimer = setTimeout(() => {
    errorMessage = '';
    render();
  }, 3000);
}

// Общая операция для добавления и удаления. Сначала сохраняем новый массив,
// затем обновляем state. Так при сбое старые книги остаются на экране.
async function changeBooks(newBooks: Book[]): Promise<boolean> {
  if (saving) return false;
  saving = true;
  // render отключит кнопки добавления и удаления на время ожидания.
  render();
  try {
    await saveBooks(newBooks);
    // Эта строка выполняется только после успешного saveBooks.
    state = { status: 'success', data: newBooks };
    errorMessage = '';
    render();
    return true;
  } catch (error) {
    showTemporaryError(error);
    return false;
  } finally {
    // finally выполняется и после успеха, и после ошибки.
    saving = false;
    render();
  }
}

function createBookCard(book: Book): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'book-card';
  const title = document.createElement('h3');
  title.textContent = `${book.title} — ${book.authors.join(', ')}${book.year ? `, ${book.year}` : ''}`;
  card.append(title);
  if (book.rating !== undefined) {
    const rating = document.createElement('p');
    rating.textContent = `Рейтинг: ${book.rating}`;
    card.append(rating);
  }

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = 'Удалить';
  deleteBtn.disabled = saving;
  deleteBtn.addEventListener('click', async () => {
    if (state.status !== 'success' || saving) return;
    // BookCatalog меняет данные в памяти синхронно. Асинхронно только
    // сохранение результата через changeBooks.
    const catalog = new BookCatalog('main', state.data);
    catalog.removeBook(book.id);
    await changeBooks(catalog.getBooks());
  });
  card.append(deleteBtn);

  const favBtn = document.createElement('button');
  favBtn.textContent = wishlist.has(book.id) ? '❤️ В избранном' : '🤍 В избранное';
  favBtn.addEventListener('click', () => {
    // Избранное не входит в задание про имитацию сети: сохраняем его
    // прежним способом и сразу обновляем подписи кнопок.
    wishlist.toggle(book.id);
    localStorage.setItem('wishlist', JSON.stringify(wishlist.getFavoriteIds()));
    render();
  });
  card.append(favBtn);
  return card;
}

function renderBooks(books: Book[]): void {
  // Удаляем старые карточки, иначе при каждой перерисовке они дублировались бы.
  bookList.replaceChildren();
  if (books.length === 0) {
    bookList.textContent = 'Книги не найдены. Попробуйте изменить фильтры.';
    return;
  }
  books.forEach(book => bookList.append(createBookCard(book)));
}

function renderWishlist(books: Book[]): void {
  wishlistContainer.replaceChildren();
  // Wishlist хранит ID. Каталог нужен ему, чтобы найти полные данные книг.
  const catalog = new BookCatalog('main', books);
  const favorites = wishlist.getFavorites(catalog);
  if (favorites.length === 0) {
    wishlistContainer.textContent = 'Пока ничего не добавлено';
    return;
  }
  favorites.forEach(book => wishlistContainer.append(createBookCard(book)));
}

function render(): void {
  // Один render отвечает за все экраны. В начале убираем прошлое сообщение.
  appStatus.replaceChildren();
  appStatus.className = '';
  // Форма и списки доступны только тогда, когда книги загружены.
  appContent.hidden = state.status !== 'success';

  switch (state.status) {
    case 'idle':
      appStatus.textContent = 'Каталог готов к загрузке.';
      break;
    case 'loading':
      // Во время загрузки не показываем карточки от предыдущего состояния.
      bookList.replaceChildren();
      wishlistContainer.replaceChildren();
      appStatus.textContent = 'Загрузка данных...';
      break;
    case 'error': {
      // Создаём кнопку заново вместе с экраном ошибки и назначаем ей повтор.
      appStatus.className = 'error';
      const message = document.createElement('span');
      message.textContent = state.message;
      const retry = document.createElement('button');
      retry.textContent = 'Повторить попытку';
      retry.addEventListener('click', () => { void initApp(); });
      appStatus.append(message, retry);
      break;
    }
    case 'success': {
      // Временная ошибка находится возле формы, не заменяя весь каталог.
      errorElement.textContent = errorMessage;
      const submit = form.querySelector('button[type="submit"]') as HTMLButtonElement;
      submit.disabled = saving;
      const filters: ((book: Book) => boolean)[] = [];
      // Добавляем только те фильтры, для которых пользователь ввёл значение.
      if (authorInput.value.trim()) filters.push(filterByAuthor(authorInput.value.trim()));
      if (yearInput.value) filters.push(filterByMinYear(parseInt(yearInput.value, 10)));
      if (searchInput.value.trim()) filters.push(filterByTitle(searchInput.value.trim()));
      const filtered = applyFilters(state.data, filters);
      // Основной список фильтруется и сортируется; избранное берёт все книги.
      renderBooks(sortBooks(filtered, sortBySelect.value as 'year' | 'rating'));
      renderWishlist(state.data);
      break;
    }
  }
}

async function initApp(): Promise<void> {
  // Сразу показываем загрузку, затем ждём ответ имитации сервера.
  state = { status: 'loading' };
  render();
  try {
    const books = await fetchBooks();
    state = { status: 'success', data: books };
  } catch (error) {
    // Ошибку загрузки показываем отдельным экраном с кнопкой повтора.
    state = { status: 'error', message: error instanceof Error ? error.message : 'Неизвестная ошибка' };
  }
  render();
}

form.addEventListener('submit', async event => {
  // Отменяем обычную отправку формы, которая перезагрузила бы страницу.
  event.preventDefault();
  if (state.status !== 'success' || saving) return;
  try {
    const book = createBookFromForm(new FormData(form));
    const catalog = new BookCatalog('main', state.data);
    catalog.addBook(book);
    // Очищаем поля только после успешной записи; при ошибке их можно исправить
    // или отправить повторно, не вводя всё заново.
    if (await changeBooks(catalog.getBooks())) form.reset();
  } catch (error) {
    showTemporaryError(error);
  }
});

filterBtn.addEventListener('click', render);
searchInput.addEventListener('input', render);
sortBySelect.addEventListener('change', render);
void initApp();
