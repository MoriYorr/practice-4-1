import type { Book } from './task1-types';

// Эта функция ничего не возвращает, кроме сигнала «ожидание закончено».
// resolve вызовется таймером через ms миллисекунд.
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchBooks(): Promise<Book[]> {
  // await приостанавливает только эту функцию, интерфейс браузера не блокируется.
  await delay(800);
  // Примерно одна загрузка из пяти завершается ошибкой, как при нестабильной сети.
  if (Math.random() < 0.2) throw new Error('Сбой сети. Не удалось загрузить книги.');
  // localStorage хранит строки, поэтому ниже разбираем JSON.
  const saved = localStorage.getItem('catalog');
  if (!saved) return [];
  const parsed: unknown = JSON.parse(saved);
  // Новый формат — массив. В предыдущей практике сохранялся объект
  // { id, books }, поэтому принимаем оба варианта и не теряем старые книги.
  if (Array.isArray(parsed)) return parsed as Book[];
  if (parsed && typeof parsed === 'object' && 'books' in parsed && Array.isArray(parsed.books)) return parsed.books as Book[];
  throw new Error('Сохранённые данные каталога повреждены.');
}

export async function saveBooks(books: Book[]): Promise<void> {
  // Сначала имитируем ожидание ответа, затем записываем весь новый массив.
  // Если запись бросит ошибку, вызывающий код поймает её через try/catch.
  await delay(500);
  localStorage.setItem('catalog', JSON.stringify(books));
}
