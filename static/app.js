const LANGS = [{id:'ru',flag:'🇷🇺',label:'Русский'},{id:'uk',flag:'🇺🇦',label:'Українська'},{id:'en',flag:'🇬🇧',label:'English'},{id:'de',flag:'🇩🇪',label:'Deutsch'},{id:'es',flag:'🇪🇸',label:'Español'},{id:'fr',flag:'🇫🇷',label:'Français'},{id:'it',flag:'🇮🇹',label:'Italiano'},{id:'pl',flag:'🇵🇱',label:'Polski'},{id:'tr',flag:'🇹🇷',label:'Türkçe'},{id:'zh',flag:'🇨🇳',label:'中文'}];
const CURRENCIES = [{id:'UAH',sym:'₴',label:'Hryvnia'},{id:'RUB',sym:'₽',label:'Ruble'},{id:'USD',sym:'$',label:'US Dollar'},{id:'EUR',sym:'€',label:'Euro'},{id:'PLN',sym:'zł',label:'Polish Zloty'},{id:'GBP',sym:'£',label:'Pound Sterling'},{id:'TRY',sym:'₺',label:'Turkish Lira'},{id:'CHF',sym:'₣',label:'Swiss Franc'},{id:'CZK',sym:'Kč',label:'Czech Koruna'},{id:'JPY',sym:'¥',label:'Japanese Yen'},{id:'CNY',sym:'元',label:'Chinese Yuan'}];

// Keep each Telegram account's financial data in its own browser storage namespace.
const telegramUserId = String(window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 'guest');
const appStorageKey = 'budgetApp_v18_user_' + telegramUserId;
const defaultAppData = {
  balance: 0, monthIncome: 0, monthExpense: 0, history: [], envelopes: [], banks: [], recurring: [], customCategories: [],
  selectedCategory: 'Еда', currentIcon: '🍔', lang: 'ru', currency: 'UAH', theme: 'dark', wallpaper: null,
  currentMonth: new Date().getFullYear() + '-' + String(new Date().getMonth()+1).padStart(2,'0')
};

// Never let a damaged or unavailable browser-storage record stop the Mini App.
// Keep the original value under a recovery key before falling back to defaults.
let appData = defaultAppData;
try {
  const storedAppData = localStorage.getItem(appStorageKey);
  if (storedAppData) {
    try {
      const parsedAppData = JSON.parse(storedAppData);
      if (parsedAppData && typeof parsedAppData === 'object' && !Array.isArray(parsedAppData)) {
        appData = parsedAppData;
      } else {
        throw new Error('Saved app data is not a valid object');
      }
    } catch (parseError) {
      try {
        localStorage.setItem(appStorageKey + '_recovery_' + Date.now(), storedAppData);
      } catch (backupError) {
        console.error('Could not back up damaged Family Budget data:', backupError);
      }
      console.error('Saved Family Budget data could not be read; original data was preserved for recovery:', parseError);
    }
  }
} catch (storageError) {
  console.warn('Browser storage is unavailable; Family Budget is running with temporary default data:', storageError);
}

let canUseProFeatures = false;
let referralStats = { count: 0, coupons10: 0, coupons20: 0 };
let battlePassStats = { paidCount: 0, volumeUsd: 0, monthKey: '', monthLabel: '', daysLeft: 0, endDate: '', claimed: { free: [], pro: [] } };
let battlePassTrack = 'free';
const BATTLE_PASS_TASKS = [
  {key:'invite1',title:'Первый шаг',desc:'Пригласи 1 пользователя',metric:'count',target:1},
  {key:'invite3',title:'Зови друзей',desc:'Пригласи 3 пользователей',metric:'count',target:3},
  {key:'paid1',title:'Первая подписка',desc:'1 реферал оплачивает подписку',metric:'paidCount',target:1},
  {key:'volume10',title:'Оборот растёт',desc:'Рефералы оплатили на $10',metric:'volumeUsd',target:10},
  {key:'invite5',title:'Своя команда',desc:'Пригласи 5 пользователей',metric:'count',target:5},
  {key:'paid3',title:'Команда платит',desc:'3 реферала оплатили подписку',metric:'paidCount',target:3},
  {key:'volume25',title:'Первые $25',desc:'Рефералы оплатили на $25',metric:'volumeUsd',target:25},
  {key:'invite10',title:'Организатор',desc:'Пригласи 10 пользователей',metric:'count',target:10},
  {key:'paid5',title:'Пять подписок',desc:'5 платных рефералов',metric:'paidCount',target:5},
  {key:'volume50',title:'Оборот $50',desc:'Рефералы оплатили на $50',metric:'volumeUsd',target:50}
];

let bankImportRows = [];
let bankImportBusy = false;

const BANK_IMPORT_I18N = {"ru":{"Открой приложение через Telegram, чтобы загрузить выписку.":"Открой приложение через Telegram, чтобы загрузить выписку.","Выбери файл CSV или XLSX.":"Выбери файл CSV или XLSX.","Файл больше 8 МБ. Раздели выписку на несколько файлов.":"Файл больше 8 МБ. Раздели выписку на несколько файлов.","Читаю выписку…":"Читаю выписку…","Не удалось прочитать выписку.":"Не удалось прочитать выписку.","Проверь суммы, типы и категории. Операции с возможными переводами отключены.":"Проверь суммы, типы и категории. Операции с возможными переводами отключены.","В выписке не найдено операций.":"В выписке не найдено операций.","Выбери хотя бы одну корректную операцию.":"Выбери хотя бы одну корректную операцию.","Импорт завершён. Добавлено: ":"Импорт завершён. Добавлено: "," · Дубликаты пропущены: ":" · Дубликаты пропущены: ","Импортировать":"Импортировать"},"uk":{"Открой приложение через Telegram, чтобы загрузить выписку.":"Відкрий застосунок через Telegram, щоб завантажити виписку.","Выбери файл CSV или XLSX.":"Вибери файл CSV або XLSX.","Файл больше 8 МБ. Раздели выписку на несколько файлов.":"Файл більший за 8 МБ. Розділи виписку на кілька файлів.","Читаю выписку…":"Читаю виписку…","Не удалось прочитать выписку.":"Не вдалося прочитати виписку.","Проверь суммы, типы и категории. Операции с возможными переводами отключены.":"Перевір суми, типи й категорії. Операції з можливими переказами вимкнено.","В выписке не найдено операций.":"У виписці не знайдено операцій.","Выбери хотя бы одну корректную операцию.":"Вибери хоча б одну коректну операцію.","Импорт завершён. Добавлено: ":"Імпорт завершено. Додано: "," · Дубликаты пропущены: ":" · Пропущено дублікатів: ","Импортировать":"Імпортувати"},"en":{"Открой приложение через Telegram, чтобы загрузить выписку.":"Open the app through Telegram to upload a statement.","Выбери файл CSV или XLSX.":"Choose a CSV or XLSX file.","Файл больше 8 МБ. Раздели выписку на несколько файлов.":"File is larger than 8 MB. Split the statement into several files.","Читаю выписку…":"Reading statement…","Не удалось прочитать выписку.":"Could not read the statement.","Проверь суммы, типы и категории. Операции с возможными переводами отключены.":"Check amounts, types and categories. Possible transfers are excluded.","В выписке не найдено операций.":"No transactions found in the statement.","Выбери хотя бы одну корректную операцию.":"Select at least one valid transaction.","Импорт завершён. Добавлено: ":"Import complete. Added: "," · Дубликаты пропущены: ":" · Duplicates skipped: ","Импортировать":"Import"},"de":{"Открой приложение через Telegram, чтобы загрузить выписку.":"Öffne die App über Telegram, um einen Kontoauszug hochzuladen.","Выбери файл CSV или XLSX.":"Wähle eine CSV- oder XLSX-Datei aus.","Файл больше 8 МБ. Раздели выписку на несколько файлов.":"Die Datei ist größer als 8 MB. Teile den Kontoauszug in mehrere Dateien auf.","Читаю выписку…":"Kontoauszug wird gelesen…","Не удалось прочитать выписку.":"Kontoauszug konnte nicht gelesen werden.","Проверь суммы, типы и категории. Операции с возможными переводами отключены.":"Prüfe Beträge, Typen und Kategorien. Mögliche Überweisungen sind ausgeschlossen.","В выписке не найдено операций.":"Keine Buchungen im Kontoauszug gefunden.","Выбери хотя бы одну корректную операцию.":"Wähle mindestens eine gültige Buchung aus.","Импорт завершён. Добавлено: ":"Import abgeschlossen. Hinzugefügt: "," · Дубликаты пропущены: ":" · Duplikate übersprungen: ","Импортировать":"Importieren"},"es":{"Открой приложение через Telegram, чтобы загрузить выписку.":"Abre la aplicación desde Telegram para cargar un extracto.","Выбери файл CSV или XLSX.":"Elige un archivo CSV o XLSX.","Файл больше 8 МБ. Раздели выписку на несколько файлов.":"El archivo supera los 8 MB. Divide el extracto en varios archivos.","Читаю выписку…":"Leyendo extracto…","Не удалось прочитать выписку.":"No se pudo leer el extracto.","Проверь суммы, типы и категории. Операции с возможными переводами отключены.":"Revisa importes, tipos y categorías. Se excluyen las posibles transferencias.","В выписке не найдено операций.":"No se encontraron operaciones en el extracto.","Выбери хотя бы одну корректную операцию.":"Selecciona al menos una operación válida.","Импорт завершён. Добавлено: ":"Importación completada. Añadidas: "," · Дубликаты пропущены: ":" · Duplicados omitidos: ","Импортировать":"Importar"},"fr":{"Открой приложение через Telegram, чтобы загрузить выписку.":"Ouvre l’application via Telegram pour importer un relevé.","Выбери файл CSV или XLSX.":"Choisis un fichier CSV ou XLSX.","Файл больше 8 МБ. Раздели выписку на несколько файлов.":"Le fichier dépasse 8 Mo. Divise le relevé en plusieurs fichiers.","Читаю выписку…":"Lecture du relevé…","Не удалось прочитать выписку.":"Impossible de lire le relevé.","Проверь суммы, типы и категории. Операции с возможными переводами отключены.":"Vérifie les montants, types et catégories. Les virements possibles sont exclus.","В выписке не найдено операций.":"Aucune opération trouvée dans le relevé.","Выбери хотя бы одну корректную операцию.":"Sélectionne au moins une opération valide.","Импорт завершён. Добавлено: ":"Importation terminée. Ajoutées : "," · Дубликаты пропущены: ":" · Doublons ignorés : ","Импортировать":"Importer"},"it":{"Открой приложение через Telegram, чтобы загрузить выписку.":"Apri l’app tramite Telegram per caricare un estratto conto.","Выбери файл CSV или XLSX.":"Scegli un file CSV o XLSX.","Файл больше 8 МБ. Раздели выписку на несколько файлов.":"Il file supera gli 8 MB. Dividi l’estratto in più file.","Читаю выписку…":"Lettura dell’estratto…","Не удалось прочитать выписку.":"Impossibile leggere l’estratto.","Проверь суммы, типы и категории. Операции с возможными переводами отключены.":"Controlla importi, tipi e categorie. I possibili trasferimenti sono esclusi.","В выписке не найдено операций.":"Nessuna operazione trovata nell’estratto.","Выбери хотя бы одну корректную операцию.":"Seleziona almeno un’operazione valida.","Импорт завершён. Добавлено: ":"Importazione completata. Aggiunte: "," · Дубликаты пропущены: ":" · Duplicati ignorati: ","Импортировать":"Importa"},"pl":{"Открой приложение через Telegram, чтобы загрузить выписку.":"Otwórz aplikację przez Telegram, aby przesłać wyciąg.","Выбери файл CSV или XLSX.":"Wybierz plik CSV lub XLSX.","Файл больше 8 МБ. Раздели выписку на несколько файлов.":"Plik przekracza 8 MB. Podziel wyciąg na kilka plików.","Читаю выписку…":"Odczytywanie wyciągu…","Не удалось прочитать выписку.":"Nie udało się odczytać wyciągu.","Проверь суммы, типы и категории. Операции с возможными переводами отключены.":"Sprawdź kwoty, typy i kategorie. Możliwe przelewy są wykluczone.","В выписке не найдено операций.":"Nie znaleziono transakcji w wyciągu.","Выбери хотя бы одну корректную операцию.":"Wybierz co najmniej jedną prawidłową transakcję.","Импорт завершён. Добавлено: ":"Import zakończony. Dodano: "," · Дубликаты пропущены: ":" · Pominięte duplikaty: ","Импортировать":"Importuj"},"tr":{"Открой приложение через Telegram, чтобы загрузить выписку.":"Ekstre yüklemek için uygulamayı Telegram üzerinden aç.","Выбери файл CSV или XLSX.":"Bir CSV veya XLSX dosyası seç.","Файл больше 8 МБ. Раздели выписку на несколько файлов.":"Dosya 8 MB'tan büyük. Ekstreyi birkaç dosyaya böl.","Читаю выписку…":"Ekstre okunuyor…","Не удалось прочитать выписку.":"Ekstre okunamadı.","Проверь суммы, типы и категории. Операции с возможными переводами отключены.":"Tutarları, türleri ve kategorileri kontrol et. Olası transferler hariç tutuldu.","В выписке не найдено операций.":"Ekstrede işlem bulunamadı.","Выбери хотя бы одну корректную операцию.":"En az bir geçerli işlem seç.","Импорт завершён. Добавлено: ":"İçe aktarma tamamlandı. Eklenen: "," · Дубликаты пропущены: ":" · Atlanan kopyalar: ","Импортировать":"İçe aktar"},"zh":{"Открой приложение через Telegram, чтобы загрузить выписку.":"请通过 Telegram 打开应用以上传账单。","Выбери файл CSV или XLSX.":"请选择 CSV 或 XLSX 文件。","Файл больше 8 МБ. Раздели выписку на несколько файлов.":"文件超过 8 MB。请将账单拆分成多个文件。","Читаю выписку…":"正在读取账单…","Не удалось прочитать выписку.":"无法读取账单。","Проверь суммы, типы и категории. Операции с возможными переводами отключены.":"请检查金额、类型和类别。可能的转账已排除。","В выписке не найдено операций.":"账单中未找到交易。","Выбери хотя бы одну корректную операцию.":"请至少选择一笔有效交易。","Импорт завершён. Добавлено: ":"导入完成。已添加："," · Дубликаты пропущены: ":" · 已跳过重复项：","Импортировать":"导入"}};
function bankUi(key){const source=key;const lang=String(appData?.lang||'ru').toLowerCase().split('-')[0];return (BANK_IMPORT_I18N[lang]&&BANK_IMPORT_I18N[lang][source])||(BANK_IMPORT_I18N.ru&&BANK_IMPORT_I18N.ru[source])||source;}

function bankEscape(value){
  return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function bankGuessCategory(title, type){
  const text=String(title||'').toLowerCase();
  if(type==='income'){
    if(/salary|зарплат|зарплата|payroll|wage|заробіт|stipend/.test(text)) return 'Зарплата';
    if(/cashback|кешбек|кэшбэк|cash back/.test(text)) return 'Кэшбэк';
    if(/interest|відсот|процент по вкладу/.test(text)) return 'Проценты по вкладу';
    if(/refund|повернен|возврат|reversal/.test(text)) return 'Возврат';
    return 'Прочее';
  }
  if(/grocery|supermarket|market|продукт|сільпо|сильпо|атб|novus|fora|варус|магазин/.test(text)) return 'Продукты';
  if(/restaurant|cafe|coffee|food|pizza|кафе|ресторан|еда|обед|ужин|кофе|макдон|mcdonald|kfc/.test(text)) return 'Еда';
  if(/taxi|uber|bolt|такси/.test(text)) return 'Такси';
  if(/fuel|petrol|gas station|бензин|заправ/.test(text)) return 'Бензин';
  if(/pharmacy|аптек|pharma/.test(text)) return 'Аптека';
  if(/electric|water|utility|коммунал|газопост|водоканал/.test(text)) return 'Коммуналка';
  if(/mobile|internet|telecom|lifecell|kyivstar|vodafone|зв'язок|связь|інтернет/.test(text)) return 'Связь';
  if(/subscription|netflix|spotify|youtube premium|подписк/.test(text)) return 'Подписки';
  if(/clothes|fashion|одежд|одяг|обув/.test(text)) return 'Одежда';
  if(/transfer|переказ|перевод/.test(text)) return 'Переводы';
  return 'Разное';
}
function bankCategoryIcon(name, type){
  const list=(type==='income'?INCOME_CATS:EXPENSE_CATS);
  const found=list.find(c=>c.name===name);
  return found?.icon || '📦';
}
function bankFingerprint(row){
  return [row.date,Number(row.amount).toFixed(2),String(row.currency||appData.currency||'UAH').toUpperCase(),String(row.title||'').trim().toLowerCase(),row.type].join('|').slice(0,128);
}
function openBankImport(){
  bankImportRows=[];bankImportBusy=false;
  const file=document.getElementById('bankStatementFile');if(file)file.value='';
  document.getElementById('bankImportStatus').textContent='';
  document.getElementById('bankImportSummary').style.display='none';
  document.getElementById('bankImportRows').innerHTML='';
  document.getElementById('bankImportConfirm').disabled=true;
  openModal('modalBankImport');
}
function closeBankImport(){if(!bankImportBusy)closeModal('modalBankImport');}
async function previewBankStatement(file){
  if(!file)return;
  const status=document.getElementById('bankImportStatus');
  const rowsNode=document.getElementById('bankImportRows');
  const confirm=document.getElementById('bankImportConfirm');
  const tg=window.Telegram?.WebApp;
  if(!tg?.initData){status.textContent=bankUi('Открой приложение через Telegram, чтобы загрузить выписку.');return;}
  if(!/\.(csv|xlsx)$/i.test(file.name)){status.textContent=bankUi('Выбери файл CSV или XLSX.');return;}
  if(file.size>8*1024*1024){status.textContent=bankUi('Файл больше 8 МБ. Раздели выписку на несколько файлов.');return;}
  bankImportBusy=true;confirm.disabled=true;rowsNode.innerHTML='';status.textContent=bankUi('Читаю выписку…');
  try{
    const form=new FormData();form.append('file',file,file.name);
    const response=await fetch('/api/import/preview',{method:'POST',headers:{'X-Init-Data':tg.initData},body:form});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.detail||bankUi('Не удалось прочитать выписку.'));
    bankImportRows=(data.rows||[]).map((row,index)=>{
      const type=row.type==='income'?'income':'expense';
      return {...row,type,category:bankGuessCategory(row.title,type),icon:bankCategoryIcon(bankGuessCategory(row.title,type),type),include:row.type!=='transfer',rowId:index,currency:row.currency||appData.currency||'UAH'};
    });
    const summary=document.getElementById('bankImportSummary');
    summary.style.display='block';
    summary.textContent=t('bank_import_count').replace('{count}',String(bankImportRows.length))+(data.skipped?t('bank_import_skipped').replace('{count}',String(data.skipped)):'')+(data.truncated?t('bank_import_truncated'):'');
    renderBankImportRows();
    status.textContent=bankImportRows.length?bankUi('Проверь суммы, типы и категории. Операции с возможными переводами отключены.'):bankUi('В выписке не найдено операций.');
    confirm.disabled=!bankImportRows.some(r=>r.include);
  }catch(error){status.textContent=error.message||'Ошибка импорта.';bankImportRows=[];rowsNode.innerHTML='';}
  finally{bankImportBusy=false;}
}
function renderBankImportRows(){
  const node=document.getElementById('bankImportRows');
  const expenseOptions=EXPENSE_CATS.map(c=>({name:c.name,icon:c.icon}));
  const incomeOptions=INCOME_CATS.map(c=>({name:c.name,icon:c.icon}));
  node.innerHTML=bankImportRows.map((row,i)=>{
    const cats=row.type==='income'?incomeOptions:expenseOptions;
    const options=cats.map(c=>'<option value="'+bankEscape(c.name)+'" '+(c.name===row.category?'selected':'')+'>'+bankEscape(c.icon+' '+tCat(c.name))+'</option>').join('');
    return '<div class="bank-import-row '+(row.include?'':'is-excluded')+'" data-bank-row="'+i+'">'+
      '<div class="bank-import-row-top"><label><input type="checkbox" '+(row.include?'checked':'')+' onchange="updateBankImportRow('+i+',\'include\',this.checked)"> <span>'+bankEscape(row.title||'Операция без описания')+'</span></label>'+
      '<strong>'+bankEscape(Number(row.amount).toLocaleString(appData.lang,{maximumFractionDigits:2}))+' '+bankEscape(row.currency||appData.currency)+'</strong></div>'+
      '<div class="bank-import-fields"><label>Дата<input type="date" value="'+bankEscape(row.date)+'" onchange="updateBankImportRow('+i+',\'date\',this.value)"></label>'+
      '<label>Тип<select onchange="updateBankImportRow('+i+',\'type\',this.value)"><option value="expense" '+(row.type==='expense'?'selected':'')+'>Расход</option><option value="income" '+(row.type==='income'?'selected':'')+'>Доход</option></select></label>'+
      '<label>Категория<select onchange="updateBankImportRow('+i+',\'category\',this.value)">'+options+'</select></label>'+
      '<label>Сумма<input type="number" min="0.01" step="0.01" value="'+bankEscape(row.amount)+'" onchange="updateBankImportRow('+i+',\'amount\',this.value)"></label></div></div>';
  }).join('');
}
function updateBankImportRow(index,field,value){
  const row=bankImportRows[index];if(!row)return;
  if(field==='amount'){const amount=Number(value);if(!Number.isFinite(amount)||amount<=0){row.include=false;}else row.amount=amount;}
  else if(field==='type'){row.type=value==='income'?'income':'expense';row.category=bankGuessCategory(row.title,row.type);row.icon=bankCategoryIcon(row.category,row.type);}
  else if(field==='category'){row.category=String(value);row.icon=bankCategoryIcon(row.category,row.type);}
  else if(field==='include')row.include=Boolean(value);
  else if(field==='date')row.date=String(value);
  const card=document.querySelector('[data-bank-row="'+index+'"]');if(card)card.classList.toggle('is-excluded',!row.include);
  if(field==='type'||field==='category')renderBankImportRows();
  document.getElementById('bankImportConfirm').disabled=!bankImportRows.some(r=>r.include&&Number(r.amount)>0&&r.date);
}
async function confirmBankImport(){
  if(bankImportBusy)return;
  const selected=bankImportRows.filter(r=>r.include&&Number.isFinite(Number(r.amount))&&Number(r.amount)>0&&/^\d{4}-\d{2}-\d{2}$/.test(r.date));
  if(!selected.length){alert(bankUi('Выбери хотя бы одну корректную операцию.'));return;}
  const unique=[],seen=new Set();
  selected.forEach(row=>{row.amount=Number(row.amount);row.currency=String(row.currency||appData.currency||'UAH').toUpperCase();row.icon=bankCategoryIcon(row.category,row.type);row.importFingerprint=bankFingerprint(row);if(!seen.has(row.importFingerprint)){seen.add(row.importFingerprint);unique.push(row);}});
  if(!unique.length)return;
  if(unique.length>500){alert(t('bank_import_limit'));return;}
  const currencies=[...new Set(unique.map(r=>String(r.currency||appData.currency||'UAH').toUpperCase()))];
  if(currencies.length>1){alert(t('bank_multi_currency'));return;}
  if(currencies[0]!==String(appData.currency||'UAH').toUpperCase()){alert(t('bank_currency_mismatch').replaceAll('{currency}',currencies[0]).replace('{appCurrency}',String(appData.currency||'UAH')));return;}
  bankImportBusy=true;const button=document.getElementById('bankImportConfirm');button.disabled=true;button.textContent=t('bank_importing');
  try{
    let imported=0,duplicates=0;
    if(budgetMode==='family'&&currentFamily){
      const tg=window.Telegram?.WebApp;
      const response=await fetch('/api/import/family',{method:'POST',headers:{'Content-Type':'application/json','X-Init-Data':tg.initData},body:JSON.stringify({transactions:unique.map(r=>({type:r.type,amount:r.amount,date:r.date,title:r.title,category:r.category,icon:r.icon,currency:r.currency,importFingerprint:r.importFingerprint}))})});
      const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.detail||'Не удалось импортировать семейные операции.');
      imported=Number(data.imported||0);duplicates=Number(data.duplicates||0);
      await Promise.all([loadFamilyTransactions(),loadFamilyEnvelopes()]);
    }else{
      const existing=new Set((appData.history||[]).map(tx=>tx.importFingerprint).filter(Boolean));
      for(const row of unique){
        if(existing.has(row.importFingerprint)){duplicates++;continue;}
        const tx={id:Date.now()+imported,type:row.type,title:String(row.title||row.category).slice(0,120),category:row.category,icon:row.icon,amount:row.amount,date:row.date,currency:row.currency,receipt:null,importFingerprint:row.importFingerprint,source:'bank-import'};
        appData.history.unshift(tx);existing.add(row.importFingerprint);imported++;
        if(row.type==='expense'){appData.balance-=row.amount;if(String(row.date).slice(0,7)===String(appData.currentMonth||''))appData.monthExpense+=row.amount;}else{appData.balance+=row.amount;if(String(row.date).slice(0,7)===String(appData.currentMonth||''))appData.monthIncome+=row.amount;}
      }
      saveData();renderAll();
    }
    closeModal('modalBankImport');
    alert(bankUi('Импорт завершён. Добавлено: ')+imported+(duplicates?bankUi(' · Дубликаты пропущены: ')+duplicates:'')+'.');
  }catch(error){alert(error.message||t('bank_import_failed'));}
  finally{bankImportBusy=false;button.disabled=false;button.textContent=bankUi('Импортировать');}
}

function saveData(){ localStorage.setItem(appStorageKey, JSON.stringify(appData)); }

async function syncChatExpenses(){
  const tg=window.Telegram?.WebApp;
  if(!tg?.initData)return;
  try{
    const response=await fetch('/api/chat-expenses',{headers:{'X-Init-Data':tg.initData}});
    if(!response.ok)return;
    const data=await response.json();
    const expenses=Array.isArray(data.expenses)?data.expenses:[];
    const known=new Set((appData.history||[]).map(tx=>String(tx.chatExpenseId||'')).filter(Boolean));
    let imported=0;
    for(const expense of expenses){
      const expenseId=String(expense.id||'');
      const amount=Number(expense.amount||0);
      if(!expenseId||known.has(expenseId)||!Number.isFinite(amount)||amount<=0)continue;
      const date=String(expense.date||new Date().toISOString().slice(0,10));
      const type=expense.type==='income'?'income':'expense';
      const tx={id:'chat_'+expenseId,chatExpenseId:expenseId,type,title:String(expense.title||expense.category||(type==='income'?'Доход':'Расход')),category:String(expense.category||'Разное'),icon:String(expense.icon||'📦'),amount,date,currency:String(expense.currency||appData.currency||'UAH'),source:'telegram-chat',ts:Number(expense.ts||Date.now())};
      appData.history.unshift(tx);
      appData.balance=Number(appData.balance||0)+(type==='income'?amount:-amount);
      if(date.slice(0,7)===String(appData.currentMonth||'')){if(type==='income')appData.monthIncome=Number(appData.monthIncome||0)+amount;else appData.monthExpense=Number(appData.monthExpense||0)+amount;}
      known.add(expenseId);imported++;
    }
    if(imported){saveData();renderAll();}
  }catch(error){console.warn('Could not sync expenses from bot chat:',error);}
}

const EXTRA_TRANSLATIONS = {"ru":{"Забери +10 монет сегодня. Серия растёт за каждый день подряд.":"Забери +10 монет сегодня. Серия растёт за каждый день подряд.","Сегодня награда уже получена. Возвращайся завтра, чтобы продолжить серию.":"Сегодня награда уже получена. Возвращайся завтра, чтобы продолжить серию.","дней подряд":"дней подряд","УРОВЕНЬ":"УРОВЕНЬ","Семейная группа активна":"Семейная группа активна"," · Ты организатор":" · Ты организатор","Участников: {count}{role}":"Участников: {count}{role}","До конца сезона":"До конца сезона","FAMILY BUDGET · COMMUNITY":"СЕМЕЙНЫЙ БЮДЖЕТ · СООБЩЕСТВО","Магазин купонов за крипту":"Магазин купонов за крипту","Купи купон за USDT. Он появится на балансе только после подтверждения оплаты Crypto Pay и останется у тебя после смены сезона.":"Купи купон за USDT. Он появится на балансе только после подтверждения оплаты Crypto Pay и останется у тебя после смены сезона.","Купить":"Купить","Оплата в USDT через Crypto Pay.":"Оплата в USDT через Crypto Pay.","Обновить баланс купонов":"Обновить баланс купонов","Траты за месяц":"Траты за месяц","Сравнение с прошлым месяцем":"Сравнение с прошлым месяцем","Куда уходят деньги":"Куда уходят деньги","Контроль бюджета":"Контроль бюджета","На что больше трачу?":"На что больше трачу?","Где сэкономить?":"Где сэкономить?","Доходы и расходы":"Доходы и расходы","Отправить":"Отправить","Мани пропуск":"Мани пропуск","дней":"дней","СЕМЕЙНЫЙ БЮДЖЕТ · СООБЩЕСТВО":"СЕМЕЙНЫЙ БЮДЖЕТ · СООБЩЕСТВО","Забрать ежедневную награду · +10 🪙":"Забрать ежедневную награду · +10 🪙","3 дня: +25":"3 дня: +25","7 дней: +70":"7 дней: +70","30 дней: +300":"30 дней: +300","🛍️ Магазин купонов":"🛍️ Магазин купонов","Купоны действуют на одну оплату подписки, скидки не суммируются.":"Купоны действуют на одну оплату подписки, скидки не суммируются.","Купон −10%":"Купон −10%","Купон −20%":"Купон −20%","800 монет":"800 монет","4 000 монет":"4 000 монет","Доступно купонов: 10% — {c10}, 20% — {c20}.":"Доступно купонов: 10% — {c10}, 20% — {c20}.","PRO: осталось {remaining} из {limit} запросов в этом месяце":"PRO: осталось {remaining} из {limit} запросов в этом месяце","Купленные запросы: {credits}":"Купленные запросы: {credits}","50 запросов · $2,99 USDT":"50 запросов · $2,99 USDT","150 запросов · $4,99 USDT":"150 запросов · $4,99 USDT","30 запросов/мес. в PRO":"30 запросов/мес. в PRO","Например: почему в этом месяце расходы выросли?":"Например: почему в этом месяце расходы выросли?","Для ответа отправляется только краткая сводка бюджета и последние операции. Переписка не сохраняется на сервере.":"Для ответа отправляется только краткая сводка бюджета и последние операции. Переписка не сохраняется на сервере.","Импорт выписки":"Импорт выписки","CSV / Excel из любого банка":"CSV / Excel из любого банка","SEASONAL REWARDS":"НАГРАДЫ СЕЗОНА","Сезон":"Сезон","Выполнение заданий":"Выполнение заданий","Бесплатный":"Бесплатный","PRO · платный":"PRO · платный","Бесплатные награды — меньше купонов, но доступны всем.":"Бесплатные награды — меньше купонов, но доступны всем.","Твоя экономия за год":"Твоя экономия за год","≈ $7.08 в месяц при годовой оплате":"≈ $7.08 в месяц при годовой оплате","BEST VALUE":"ЛУЧШАЯ ЦЕНА","PREMIUM EXPERIENCE":"ПРЕМИАЛЬНЫЕ ВОЗМОЖНОСТИ"},"uk":{"Забери +10 монет сегодня. Серия растёт за каждый день подряд.":"Забери +10 монет сьогодні. Серія зростає за кожен день поспіль.","Сегодня награда уже получена. Возвращайся завтра, чтобы продолжить серию.":"Сьогодні нагороду вже отримано. Повертайся завтра, щоб продовжити серію.","дней подряд":"днів поспіль","УРОВЕНЬ":"РІВЕНЬ","Семейная группа активна":"Сімейна група активна"," · Ты организатор":" · Ти організатор","Участников: {count}{role}":"Учасників: {count}{role}","До конца сезона":"До кінця сезону","FAMILY BUDGET · COMMUNITY":"СІМЕЙНИЙ БЮДЖЕТ · СПІЛЬНОТА","Магазин купонов за крипту":"Магазин купонів за криптовалюту","Купи купон за USDT. Он появится на балансе только после подтверждения оплаты Crypto Pay и останется у тебя после смены сезона.":"Купи купон за USDT. Він з’явиться на балансі лише після підтвердження оплати Crypto Pay і залишиться в тебе після зміни сезону.","Купить":"Купити","Оплата в USDT через Crypto Pay.":"Оплата в USDT через Crypto Pay.","Обновить баланс купонов":"Оновити баланс купонів","Траты за месяц":"Витрати за місяць","Сравнение с прошлым месяцем":"Порівняння з минулим місяцем","Куда уходят деньги":"Куди йдуть гроші","Контроль бюджета":"Контроль бюджету","На что больше трачу?":"На що витрачаю найбільше?","Где сэкономить?":"Де заощадити?","Доходы и расходы":"Доходи та витрати","Отправить":"Надіслати","Мани пропуск":"Мані перепустка","дней":"днів","СЕМЕЙНЫЙ БЮДЖЕТ · СООБЩЕСТВО":"СІМЕЙНИЙ БЮДЖЕТ · СПІЛЬНОТА","Забрать ежедневную награду · +10 🪙":"Забрати щоденну нагороду · +10 🪙","3 дня: +25":"3 дні: +25","7 дней: +70":"7 днів: +70","30 дней: +300":"30 днів: +300","🛍️ Магазин купонов":"🛍️ Магазин купонів","Купоны действуют на одну оплату подписки, скидки не суммируются.":"Купони діють на одну оплату підписки, знижки не додаються.","Купон −10%":"Купон −10%","Купон −20%":"Купон −20%","800 монет":"800 монет","4 000 монет":"4 000 монет","Доступно купонов: 10% — {c10}, 20% — {c20}.":"Доступно купонів: 10% — {c10}, 20% — {c20}.","PRO: осталось {remaining} из {limit} запросов в этом месяце":"PRO: залишилося {remaining} із {limit} запитів цього місяця","Купленные запросы: {credits}":"Придбані запити: {credits}","50 запросов · $2,99 USDT":"50 запитів · $2,99 USDT","150 запросов · $4,99 USDT":"150 запитів · $4,99 USDT","30 запросов/мес. в PRO":"30 запитів/міс. у PRO","Например: почему в этом месяце расходы выросли?":"Наприклад: чому цього місяця витрати зросли?","Для ответа отправляется только краткая сводка бюджета и последние операции. Переписка не сохраняется на сервере.":"Для відповіді надсилається лише коротке зведення бюджету й останні операції. Листування не зберігається на сервері.","Импорт выписки":"Імпорт виписки","CSV / Excel из любого банка":"CSV / Excel з будь-якого банку","SEASONAL REWARDS":"СЕЗОННІ НАГОРОДИ","Сезон":"Сезон","Выполнение заданий":"Виконання завдань","Бесплатный":"Безкоштовний","PRO · платный":"PRO · платний","Бесплатные награды — меньше купонов, но доступны всем.":"Безкоштовні нагороди — менше купонів, але доступні всім.","Твоя экономия за год":"Твоя економія за рік","≈ $7.08 в месяц при годовой оплате":"≈ $7.08 на місяць за річної оплати","BEST VALUE":"НАЙКРАЩА ЦІНА","PREMIUM EXPERIENCE":"ПРЕМІАЛЬНІ МОЖЛИВОСТІ"},"en":{"Забери +10 монет сегодня. Серия растёт за каждый день подряд.":"Claim +10 coins today. Your streak grows with every consecutive day.","Сегодня награда уже получена. Возвращайся завтра, чтобы продолжить серию.":"Today's reward has already been claimed. Come back tomorrow to continue your streak.","дней подряд":"days in a row","УРОВЕНЬ":"LEVEL","Семейная группа активна":"Family group is active"," · Ты организатор":" · You are the organizer","Участников: {count}{role}":"Members: {count}{role}","До конца сезона":"Until the season ends","FAMILY BUDGET · COMMUNITY":"FAMILY BUDGET · COMMUNITY","Магазин купонов за крипту":"Crypto coupon shop","Купи купон за USDT. Он появится на балансе только после подтверждения оплаты Crypto Pay и останется у тебя после смены сезона.":"Buy a coupon with USDT. It will appear in your balance only after Crypto Pay confirms the payment and will remain yours after the season changes.","Купить":"Buy","Оплата в USDT через Crypto Pay.":"Pay in USDT via Crypto Pay.","Обновить баланс купонов":"Refresh coupon balance","Траты за месяц":"Monthly spending","Сравнение с прошлым месяцем":"Comparison with last month","Куда уходят деньги":"Where your money goes","Контроль бюджета":"Budget control","На что больше трачу?":"What do I spend the most on?","Где сэкономить?":"Where can I save?","Доходы и расходы":"Income and expenses","Отправить":"Send","Мани пропуск":"Money Pass","дней":"days","СЕМЕЙНЫЙ БЮДЖЕТ · СООБЩЕСТВО":"FAMILY BUDGET · COMMUNITY","Забрать ежедневную награду · +10 🪙":"Claim daily reward · +10 🪙","3 дня: +25":"3 days: +25","7 дней: +70":"7 days: +70","30 дней: +300":"30 days: +300","🛍️ Магазин купонов":"Coupon shop","Купоны действуют на одну оплату подписки, скидки не суммируются.":"Coupons apply to one subscription payment. Discounts cannot be combined.","Купон −10%":"10% coupon","Купон −20%":"20% coupon","800 монет":"800 coins","4 000 монет":"4,000 coins","Доступно купонов: 10% — {c10}, 20% — {c20}.":"Available coupons: 10% — {c10}, 20% — {c20}.","PRO: осталось {remaining} из {limit} запросов в этом месяце":"PRO: {remaining} of {limit} requests remaining this month","Купленные запросы: {credits}":"Purchased requests: {credits}","50 запросов · $2,99 USDT":"50 requests · $2.99 USDT","150 запросов · $4,99 USDT":"150 requests · $4.99 USDT","30 запросов/мес. в PRO":"30 requests/month with PRO","Например: почему в этом месяце расходы выросли?":"For example: why did my spending increase this month?","Для ответа отправляется только краткая сводка бюджета и последние операции. Переписка не сохраняется на сервере.":"Only a brief budget summary and recent transactions are sent to generate a reply. The conversation is not stored on the server.","Импорт выписки":"Import statement","CSV / Excel из любого банка":"CSV / Excel from any bank","SEASONAL REWARDS":"SEASONAL REWARDS","Сезон":"Season","Выполнение заданий":"Task progress","Бесплатный":"Free","PRO · платный":"PRO · paid","Бесплатные награды — меньше купонов, но доступны всем.":"Free rewards include fewer coupons but are available to everyone.","Твоя экономия за год":"Your yearly savings","≈ $7.08 в месяц при годовой оплате":"≈ $7.08 per month with annual billing","BEST VALUE":"BEST VALUE","PREMIUM EXPERIENCE":"PREMIUM EXPERIENCE"},"de":{"Забери +10 монет сегодня. Серия растёт за каждый день подряд.":"Hol dir heute +10 Münzen. Deine Serie wächst mit jedem aufeinanderfolgenden Tag.","Сегодня награда уже получена. Возвращайся завтра, чтобы продолжить серию.":"Die heutige Belohnung wurde bereits abgeholt. Komm morgen wieder, um deine Serie fortzusetzen.","дней подряд":"Tage in Folge","УРОВЕНЬ":"LEVEL","Семейная группа активна":"Familiengruppe ist aktiv"," · Ты организатор":" · Du bist der Organisator","Участников: {count}{role}":"Mitglieder: {count}{role}","До конца сезона":"Bis zum Saisonende","FAMILY BUDGET · COMMUNITY":"FAMILY BUDGET · COMMUNITY","Магазин купонов за крипту":"Krypto-Gutscheinshop","Купи купон за USDT. Он появится на балансе только после подтверждения оплаты Crypto Pay и останется у тебя после смены сезона.":"Kaufe einen Gutschein mit USDT. Er wird deinem Guthaben nach der Bestätigung durch Crypto Pay gutgeschrieben und bleibt auch nach dem Saisonwechsel erhalten.","Купить":"Kaufen","Оплата в USDT через Crypto Pay.":"Zahlung in USDT über Crypto Pay.","Обновить баланс купонов":"Gutscheinstand aktualisieren","Траты за месяц":"Monatliche Ausgaben","Сравнение с прошлым месяцем":"Vergleich mit dem Vormonat","Куда уходят деньги":"Wohin dein Geld fließt","Контроль бюджета":"Budgetkontrolle","На что больше трачу?":"Wofür gebe ich am meisten aus?","Где сэкономить?":"Wo kann ich sparen?","Доходы и расходы":"Einnahmen und Ausgaben","Отправить":"Senden","Мани пропуск":"Money-Pass","дней":"Tage","СЕМЕЙНЫЙ БЮДЖЕТ · СООБЩЕСТВО":"FAMILY BUDGET · COMMUNITY","Забрать ежедневную награду · +10 🪙":"Tägliche Belohnung abholen · +10 🪙","3 дня: +25":"3 Tage: +25","7 дней: +70":"7 Tage: +70","30 дней: +300":"30 Tage: +300","🛍️ Магазин купонов":"Gutscheinshop","Купоны действуют на одну оплату подписки, скидки не суммируются.":"Gutscheine gelten für eine Abozahlung. Rabatte sind nicht kombinierbar.","Купон −10%":"10-%-Gutschein","Купон −20%":"20-%-Gutschein","800 монет":"800 Münzen","4 000 монет":"4.000 Münzen","Доступно купонов: 10% — {c10}, 20% — {c20}.":"Verfügbare Gutscheine: 10 % — {c10}, 20 % — {c20}.","PRO: осталось {remaining} из {limit} запросов в этом месяце":"PRO: {remaining} von {limit} Anfragen diesen Monat übrig","Купленные запросы: {credits}":"Gekaufte Anfragen: {credits}","50 запросов · $2,99 USDT":"50 Anfragen · 2,99 $ USDT","150 запросов · $4,99 USDT":"150 Anfragen · 4,99 $ USDT","30 запросов/мес. в PRO":"30 Anfragen/Monat mit PRO","Например: почему в этом месяце расходы выросли?":"Zum Beispiel: Warum sind meine Ausgaben diesen Monat gestiegen?","Для ответа отправляется только краткая сводка бюджета и последние операции. Переписка не сохраняется на сервере.":"Für die Antwort werden nur eine kurze Budgetübersicht und die letzten Transaktionen gesendet. Der Chat wird nicht auf dem Server gespeichert.","Импорт выписки":"Kontoauszug importieren","CSV / Excel из любого банка":"CSV / Excel von jeder Bank","SEASONAL REWARDS":"SAISONBELOHNUNGEN","Сезон":"Saison","Выполнение заданий":"Aufgabenfortschritt","Бесплатный":"Kostenlos","PRO · платный":"PRO · kostenpflichtig","Бесплатные награды — меньше купонов, но доступны всем.":"Kostenlose Belohnungen enthalten weniger Gutscheine, sind aber für alle verfügbar.","Твоя экономия за год":"Deine jährliche Ersparnis","≈ $7.08 в месяц при годовой оплате":"≈ 7,08 $ pro Monat bei jährlicher Zahlung","BEST VALUE":"BESTES ANGEBOT","PREMIUM EXPERIENCE":"PREMIUM-ERLEBNIS"},"es":{"Забери +10 монет сегодня. Серия растёт за каждый день подряд.":"Reclama +10 monedas hoy. Tu racha aumenta por cada día consecutivo.","Сегодня награда уже получена. Возвращайся завтра, чтобы продолжить серию.":"La recompensa de hoy ya se ha reclamado. Vuelve mañana para continuar tu racha.","дней подряд":"días seguidos","УРОВЕНЬ":"NIVEL","Семейная группа активна":"El grupo familiar está activo"," · Ты организатор":" · Eres el organizador","Участников: {count}{role}":"Miembros: {count}{role}","До конца сезона":"Hasta el final de la temporada","FAMILY BUDGET · COMMUNITY":"FAMILY BUDGET · COMUNIDAD","Магазин купонов за крипту":"Tienda de cupones cripto","Купи купон за USDT. Он появится на балансе только после подтверждения оплаты Crypto Pay и останется у тебя после смены сезона.":"Compra un cupón con USDT. Aparecerá en tu saldo solo después de que Crypto Pay confirme el pago y seguirá siendo tuyo tras el cambio de temporada.","Купить":"Comprar","Оплата в USDT через Crypto Pay.":"Pago en USDT mediante Crypto Pay.","Обновить баланс купонов":"Actualizar saldo de cupones","Траты за месяц":"Gastos del mes","Сравнение с прошлым месяцем":"Comparación con el mes pasado","Куда уходят деньги":"En qué se va tu dinero","Контроль бюджета":"Control del presupuesto","На что больше трачу?":"¿En qué gasto más?","Где сэкономить?":"¿Dónde puedo ahorrar?","Доходы и расходы":"Ingresos y gastos","Отправить":"Enviar","Мани пропуск":"Pase Money","дней":"días","СЕМЕЙНЫЙ БЮДЖЕТ · СООБЩЕСТВО":"FAMILY BUDGET · COMUNIDAD","Забрать ежедневную награду · +10 🪙":"Reclamar recompensa diaria · +10 🪙","3 дня: +25":"3 días: +25","7 дней: +70":"7 días: +70","30 дней: +300":"30 días: +300","🛍️ Магазин купонов":"Tienda de cupones","Купоны действуют на одну оплату подписки, скидки не суммируются.":"Los cupones se aplican a un pago de suscripción. Los descuentos no se acumulan.","Купон −10%":"Cupón del 10 %","Купон −20%":"Cupón del 20 %","800 монет":"800 monedas","4 000 монет":"4.000 monedas","Доступно купонов: 10% — {c10}, 20% — {c20}.":"Cupones disponibles: 10 % — {c10}, 20 % — {c20}.","PRO: осталось {remaining} из {limit} запросов в этом месяце":"PRO: quedan {remaining} de {limit} consultas este mes","Купленные запросы: {credits}":"Consultas compradas: {credits}","50 запросов · $2,99 USDT":"50 consultas · 2,99 $ USDT","150 запросов · $4,99 USDT":"150 consultas · 4,99 $ USDT","30 запросов/мес. в PRO":"30 consultas/mes con PRO","Например: почему в этом месяце расходы выросли?":"Por ejemplo: ¿por qué han aumentado mis gastos este mes?","Для ответа отправляется только краткая сводка бюджета и последние операции. Переписка не сохраняется на сервере.":"Para responder, solo se envían un breve resumen del presupuesto y las últimas operaciones. La conversación no se guarda en el servidor.","Импорт выписки":"Importar extracto","CSV / Excel из любого банка":"CSV / Excel de cualquier banco","SEASONAL REWARDS":"RECOMPENSAS DE TEMPORADA","Сезон":"Temporada","Выполнение заданий":"Progreso de tareas","Бесплатный":"Gratis","PRO · платный":"PRO · de pago","Бесплатные награды — меньше купонов, но доступны всем.":"Las recompensas gratis incluyen menos cupones, pero están disponibles para todos.","Твоя экономия за год":"Tu ahorro anual","≈ $7.08 в месяц при годовой оплате":"≈ 7,08 $ al mes con facturación anual","BEST VALUE":"MEJOR OFERTA","PREMIUM EXPERIENCE":"EXPERIENCIA PREMIUM"},"fr":{"Забери +10 монет сегодня. Серия растёт за каждый день подряд.":"Récupère +10 pièces aujourd’hui. Ta série augmente chaque jour consécutif.","Сегодня награда уже получена. Возвращайся завтра, чтобы продолжить серию.":"La récompense du jour a déjà été récupérée. Reviens demain pour poursuivre ta série.","дней подряд":"jours d’affilée","УРОВЕНЬ":"NIVEAU","Семейная группа активна":"Le groupe familial est actif"," · Ты организатор":" · Tu es l’organisateur","Участников: {count}{role}":"Membres : {count}{role}","До конца сезона":"Jusqu’à la fin de la saison","FAMILY BUDGET · COMMUNITY":"FAMILY BUDGET · COMMUNAUTÉ","Магазин купонов за крипту":"Boutique de coupons crypto","Купи купон за USDT. Он появится на балансе только после подтверждения оплаты Crypto Pay и останется у тебя после смены сезона.":"Achète un coupon en USDT. Il apparaîtra dans ton solde après confirmation du paiement par Crypto Pay et restera disponible après le changement de saison.","Купить":"Acheter","Оплата в USDT через Crypto Pay.":"Paiement en USDT via Crypto Pay.","Обновить баланс купонов":"Actualiser le solde des coupons","Траты за месяц":"Dépenses du mois","Сравнение с прошлым месяцем":"Comparaison avec le mois dernier","Куда уходят деньги":"Où va ton argent","Контроль бюджета":"Contrôle du budget","На что больше трачу?":"Dans quoi est-ce que je dépense le plus ?","Где сэкономить?":"Où puis-je économiser ?","Доходы и расходы":"Revenus et dépenses","Отправить":"Envoyer","Мани пропуск":"Pass Money","дней":"jours","СЕМЕЙНЫЙ БЮДЖЕТ · СООБЩЕСТВО":"FAMILY BUDGET · COMMUNAUTÉ","Забрать ежедневную награду · +10 🪙":"Récupérer la récompense quotidienne · +10 🪙","3 дня: +25":"3 jours : +25","7 дней: +70":"7 jours : +70","30 дней: +300":"30 jours : +300","🛍️ Магазин купонов":"Boutique de coupons","Купоны действуют на одну оплату подписки, скидки не суммируются.":"Les coupons s’appliquent à un seul paiement d’abonnement. Les réductions ne sont pas cumulables.","Купон −10%":"Coupon −10 %","Купон −20%":"Coupon −20 %","800 монет":"800 pièces","4 000 монет":"4 000 pièces","Доступно купонов: 10% — {c10}, 20% — {c20}.":"Coupons disponibles : 10 % — {c10}, 20 % — {c20}.","PRO: осталось {remaining} из {limit} запросов в этом месяце":"PRO : {remaining} requêtes sur {limit} restantes ce mois-ci","Купленные запросы: {credits}":"Requêtes achetées : {credits}","50 запросов · $2,99 USDT":"50 requêtes · 2,99 $ USDT","150 запросов · $4,99 USDT":"150 requêtes · 4,99 $ USDT","30 запросов/мес. в PRO":"30 requêtes/mois avec PRO","Например: почему в этом месяце расходы выросли?":"Par exemple : pourquoi mes dépenses ont-elles augmenté ce mois-ci ?","Для ответа отправляется только краткая сводка бюджета и последние операции. Переписка не сохраняется на сервере.":"Seuls un bref résumé du budget et les dernières opérations sont envoyés pour répondre. La conversation n’est pas enregistrée sur le serveur.","Импорт выписки":"Importer un relevé","CSV / Excel из любого банка":"CSV / Excel de n’importe quelle banque","SEASONAL REWARDS":"RÉCOMPENSES DE SAISON","Сезон":"Saison","Выполнение заданий":"Progression des missions","Бесплатный":"Gratuit","PRO · платный":"PRO · payant","Бесплатные награды — меньше купонов, но доступны всем.":"Les récompenses gratuites offrent moins de coupons, mais sont accessibles à tous.","Твоя экономия за год":"Tes économies annuelles","≈ $7.08 в месяц при годовой оплате":"≈ 7,08 $ par mois avec facturation annuelle","BEST VALUE":"MEILLEURE OFFRE","PREMIUM EXPERIENCE":"EXPÉRIENCE PREMIUM"},"it":{"Забери +10 монет сегодня. Серия растёт за каждый день подряд.":"Riscatta +10 monete oggi. La tua serie cresce per ogni giorno consecutivo.","Сегодня награда уже получена. Возвращайся завтра, чтобы продолжить серию.":"La ricompensa di oggi è già stata riscattata. Torna domani per continuare la serie.","дней подряд":"giorni consecutivi","УРОВЕНЬ":"LIVELLO","Семейная группа активна":"Il gruppo famiglia è attivo"," · Ты организатор":" · Sei l’organizzatore","Участников: {count}{role}":"Membri: {count}{role}","До конца сезона":"Fino alla fine della stagione","FAMILY BUDGET · COMMUNITY":"FAMILY BUDGET · COMMUNITY","Магазин купонов за крипту":"Negozio coupon crypto","Купи купон за USDT. Он появится на балансе только после подтверждения оплаты Crypto Pay и останется у тебя после смены сезона.":"Acquista un coupon in USDT. Apparirà nel saldo solo dopo la conferma del pagamento da parte di Crypto Pay e resterà disponibile dopo il cambio di stagione.","Купить":"Acquista","Оплата в USDT через Crypto Pay.":"Pagamento in USDT tramite Crypto Pay.","Обновить баланс купонов":"Aggiorna saldo coupon","Траты за месяц":"Spese del mese","Сравнение с прошлым месяцем":"Confronto con il mese scorso","Куда уходят деньги":"Dove finiscono i tuoi soldi","Контроль бюджета":"Controllo del budget","На что больше трачу?":"Per cosa spendo di più?","Где сэкономить?":"Dove posso risparmiare?","Доходы и расходы":"Entrate e uscite","Отправить":"Invia","Мани пропуск":"Pass Money","дней":"giorni","СЕМЕЙНЫЙ БЮДЖЕТ · СООБЩЕСТВО":"FAMILY BUDGET · COMMUNITY","Забрать ежедневную награду · +10 🪙":"Riscatta la ricompensa giornaliera · +10 🪙","3 дня: +25":"3 giorni: +25","7 дней: +70":"7 giorni: +70","30 дней: +300":"30 giorni: +300","🛍️ Магазин купонов":"Negozio coupon","Купоны действуют на одну оплату подписки, скидки не суммируются.":"I coupon si applicano a un solo pagamento dell’abbonamento. Gli sconti non sono cumulabili.","Купон −10%":"Coupon −10%","Купон −20%":"Coupon −20%","800 монет":"800 monete","4 000 монет":"4.000 monete","Доступно купонов: 10% — {c10}, 20% — {c20}.":"Coupon disponibili: 10% — {c10}, 20% — {c20}.","PRO: осталось {remaining} из {limit} запросов в этом месяце":"PRO: {remaining} richieste su {limit} rimaste questo mese","Купленные запросы: {credits}":"Richieste acquistate: {credits}","50 запросов · $2,99 USDT":"50 richieste · 2,99 $ USDT","150 запросов · $4,99 USDT":"150 richieste · 4,99 $ USDT","30 запросов/мес. в PRO":"30 richieste/mese con PRO","Например: почему в этом месяце расходы выросли?":"Ad esempio: perché le mie spese sono aumentate questo mese?","Для ответа отправляется только краткая сводка бюджета и последние операции. Переписка не сохраняется на сервере.":"Per rispondere vengono inviati solo un breve riepilogo del budget e le ultime operazioni. La conversazione non viene salvata sul server.","Импорт выписки":"Importa estratto","CSV / Excel из любого банка":"CSV / Excel da qualsiasi banca","SEASONAL REWARDS":"RICOMPENSE STAGIONALI","Сезон":"Stagione","Выполнение заданий":"Avanzamento attività","Бесплатный":"Gratis","PRO · платный":"PRO · a pagamento","Бесплатные награды — меньше купонов, но доступны всем.":"Le ricompense gratuite includono meno coupon, ma sono disponibili per tutti.","Твоя экономия за год":"Il tuo risparmio annuale","≈ $7.08 в месяц при годовой оплате":"≈ 7,08 $ al mese con fatturazione annuale","BEST VALUE":"MIGLIOR OFFERTA","PREMIUM EXPERIENCE":"ESPERIENZA PREMIUM"},"pl":{"Забери +10 монет сегодня. Серия растёт за каждый день подряд.":"Odbierz dziś +10 monet. Twoja seria rośnie z każdym kolejnym dniem.","Сегодня награда уже получена. Возвращайся завтра, чтобы продолжить серию.":"Dzisiejsza nagroda została już odebrana. Wróć jutro, aby kontynuować serię.","дней подряд":"dni z rzędu","УРОВЕНЬ":"POZIOM","Семейная группа активна":"Grupa rodzinna jest aktywna"," · Ты организатор":" · Jesteś organizatorem","Участников: {count}{role}":"Uczestnicy: {count}{role}","До конца сезона":"Do końca sezonu","FAMILY BUDGET · COMMUNITY":"FAMILY BUDGET · SPOŁECZNOŚĆ","Магазин купонов за крипту":"Sklep z kuponami za krypto","Купи купон за USDT. Он появится на балансе только после подтверждения оплаты Crypto Pay и останется у тебя после смены сезона.":"Kup kupon za USDT. Pojawi się na saldzie dopiero po potwierdzeniu płatności przez Crypto Pay i pozostanie na koncie po zmianie sezonu.","Купить":"Kup","Оплата в USDT через Crypto Pay.":"Płatność w USDT przez Crypto Pay.","Обновить баланс купонов":"Odśwież saldo kuponów","Траты за месяц":"Wydatki miesięczne","Сравнение с прошлым месяцем":"Porównanie z poprzednim miesiącem","Куда уходят деньги":"Na co wydajesz pieniądze","Контроль бюджета":"Kontrola budżetu","На что больше трачу?":"Na co wydaję najwięcej?","Где сэкономить?":"Gdzie mogę zaoszczędzić?","Доходы и расходы":"Przychody i wydatki","Отправить":"Wyślij","Мани пропуск":"Money Pass","дней":"dni","СЕМЕЙНЫЙ БЮДЖЕТ · СООБЩЕСТВО":"FAMILY BUDGET · SPOŁECZNOŚĆ","Забрать ежедневную награду · +10 🪙":"Odbierz codzienną nagrodę · +10 🪙","3 дня: +25":"3 dni: +25","7 дней: +70":"7 dni: +70","30 дней: +300":"30 dni: +300","🛍️ Магазин купонов":"Sklep z kuponami","Купоны действуют на одну оплату подписки, скидки не суммируются.":"Kupony obowiązują przy jednej płatności za subskrypcję. Rabaty nie łączą się.","Купон −10%":"Kupon −10%","Купон −20%":"Kupon −20%","800 монет":"800 monet","4 000 монет":"4000 monet","Доступно купонов: 10% — {c10}, 20% — {c20}.":"Dostępne kupony: 10% — {c10}, 20% — {c20}.","PRO: осталось {remaining} из {limit} запросов в этом месяце":"PRO: pozostało {remaining} z {limit} zapytań w tym miesiącu","Купленные запросы: {credits}":"Kupione zapytania: {credits}","50 запросов · $2,99 USDT":"50 zapytań · 2,99 $ USDT","150 запросов · $4,99 USDT":"150 zapytań · 4,99 $ USDT","30 запросов/мес. в PRO":"30 zapytań/mies. w PRO","Например: почему в этом месяце расходы выросли?":"Na przykład: dlaczego moje wydatki wzrosły w tym miesiącu?","Для ответа отправляется только краткая сводка бюджета и последние операции. Переписка не сохраняется на сервере.":"Do odpowiedzi wysyłane jest tylko krótkie podsumowanie budżetu i ostatnie transakcje. Rozmowa nie jest przechowywana na serwerze.","Импорт выписки":"Importuj wyciąg","CSV / Excel из любого банка":"CSV / Excel z dowolnego banku","SEASONAL REWARDS":"NAGRODY SEZONOWE","Сезон":"Sezon","Выполнение заданий":"Postęp zadań","Бесплатный":"Bezpłatny","PRO · платный":"PRO · płatny","Бесплатные награды — меньше купонов, но доступны всем.":"Darmowe nagrody obejmują mniej kuponów, ale są dostępne dla wszystkich.","Твоя экономия за год":"Twoja roczna oszczędność","≈ $7.08 в месяц при годовой оплате":"≈ 7,08 $ miesięcznie przy płatności rocznej","BEST VALUE":"NAJLEPSZA OFERTA","PREMIUM EXPERIENCE":"WERSJA PREMIUM"},"tr":{"Забери +10 монет сегодня. Серия растёт за каждый день подряд.":"Bugün +10 jeton al. Serin, üst üste gelen her gün artar.","Сегодня награда уже получена. Возвращайся завтра, чтобы продолжить серию.":"Bugünün ödülü zaten alındı. Serine devam etmek için yarın tekrar gel.","дней подряд":"gün üst üste","УРОВЕНЬ":"SEVİYE","Семейная группа активна":"Aile grubu aktif"," · Ты организатор":" · Organizatör sensin","Участников: {count}{role}":"Üye sayısı: {count}{role}","До конца сезона":"Sezonun bitmesine","FAMILY BUDGET · COMMUNITY":"FAMILY BUDGET · TOPLULUK","Магазин купонов за крипту":"Kripto kupon mağazası","Купи купон за USDT. Он появится на балансе только после подтверждения оплаты Crypto Pay и останется у тебя после смены сезона.":"USDT ile kupon satın al. Kupon, Crypto Pay ödemeyi onayladıktan sonra bakiyene eklenir ve sezon değişse de sende kalır.","Купить":"Satın al","Оплата в USDT через Crypto Pay.":"Crypto Pay ile USDT ödemesi.","Обновить баланс купонов":"Kupon bakiyesini yenile","Траты за месяц":"Aylık harcama","Сравнение с прошлым месяцем":"Geçen ayla karşılaştırma","Куда уходят деньги":"Paran nereye gidiyor","Контроль бюджета":"Bütçe kontrolü","На что больше трачу?":"En çok neye harcıyorum?","Где сэкономить?":"Nereden tasarruf edebilirim?","Доходы и расходы":"Gelir ve giderler","Отправить":"Gönder","Мани пропуск":"Money Pass","дней":"gün","СЕМЕЙНЫЙ БЮДЖЕТ · СООБЩЕСТВО":"FAMILY BUDGET · TOPLULUK","Забрать ежедневную награду · +10 🪙":"Günlük ödülü al · +10 🪙","3 дня: +25":"3 gün: +25","7 дней: +70":"7 gün: +70","30 дней: +300":"30 gün: +300","🛍️ Магазин купонов":"Kupon mağazası","Купоны действуют на одну оплату подписки, скидки не суммируются.":"Kuponlar tek bir abonelik ödemesinde geçerlidir. İndirimler birleştirilemez.","Купон −10%":"%10 kupon","Купон −20%":"%20 kupon","800 монет":"800 jeton","4 000 монет":"4.000 jeton","Доступно купонов: 10% — {c10}, 20% — {c20}.":"Mevcut kuponlar: %10 — {c10}, %20 — {c20}.","PRO: осталось {remaining} из {limit} запросов в этом месяце":"PRO: bu ay {limit} isteğin {remaining} tanesi kaldı","Купленные запросы: {credits}":"Satın alınan istekler: {credits}","50 запросов · $2,99 USDT":"50 istek · 2,99 $ USDT","150 запросов · $4,99 USDT":"150 istek · 4,99 $ USDT","30 запросов/мес. в PRO":"PRO'da ayda 30 istek","Например: почему в этом месяце расходы выросли?":"Örneğin: bu ay harcamalarım neden arttı?","Для ответа отправляется только краткая сводка бюджета и последние операции. Переписка не сохраняется на сервере.":"Yanıt için yalnızca kısa bütçe özeti ve son işlemler gönderilir. Görüşme sunucuda saklanmaz.","Импорт выписки":"Ekstreyi içe aktar","CSV / Excel из любого банка":"Herhangi bir bankadan CSV / Excel","SEASONAL REWARDS":"SEZON ÖDÜLLERİ","Сезон":"Sezon","Выполнение заданий":"Görev ilerlemesi","Бесплатный":"Ücretsiz","PRO · платный":"PRO · ücretli","Бесплатные награды — меньше купонов, но доступны всем.":"Ücretsiz ödüllerde daha az kupon vardır ancak herkes erişebilir.","Твоя экономия за год":"Yıllık tasarrufun","≈ $7.08 в месяц при годовой оплате":"Yıllık ödemede ayda yaklaşık 7,08 $","BEST VALUE":"EN İYİ FİYAT","PREMIUM EXPERIENCE":"PREMIUM DENEYİM"},"zh":{"Забери +10 монет сегодня. Серия растёт за каждый день подряд.":"今天领取 +10 金币。连续签到的每一天都会延长你的连续记录。","Сегодня награда уже получена. Возвращайся завтра, чтобы продолжить серию.":"今天的奖励已领取。明天再来，继续保持连续签到。","дней подряд":"连续天数","УРОВЕНЬ":"等级","Семейная группа активна":"家庭群组已启用"," · Ты организатор":" · 你是组织者","Участников: {count}{role}":"成员：{count}{role}","До конца сезона":"距离赛季结束","FAMILY BUDGET · COMMUNITY":"家庭预算 · 社区","Магазин купонов за крипту":"加密货币优惠券商店","Купи купон за USDT. Он появится на балансе только после подтверждения оплаты Crypto Pay и останется у тебя после смены сезона.":"使用 USDT 购买优惠券。只有 Crypto Pay 确认付款后，优惠券才会计入余额，并且赛季更换后仍会保留。","Купить":"购买","Оплата в USDT через Crypto Pay.":"通过 Crypto Pay 使用 USDT 付款。","Обновить баланс купонов":"刷新优惠券余额","Траты за месяц":"本月支出","Сравнение с прошлым месяцем":"与上月比较","Куда уходят деньги":"钱都花到哪里了","Контроль бюджета":"预算管理","На что больше трачу?":"我在哪方面花钱最多？","Где сэкономить?":"哪里可以省钱？","Доходы и расходы":"收入与支出","Отправить":"发送","Мани пропуск":"金币通行证","дней":"天","СЕМЕЙНЫЙ БЮДЖЕТ · СООБЩЕСТВО":"家庭预算 · 社区","Забрать ежедневную награду · +10 🪙":"领取每日奖励 · +10 🪙","3 дня: +25":"连续 3 天：+25","7 дней: +70":"连续 7 天：+70","30 дней: +300":"连续 30 天：+300","🛍️ Магазин купонов":"优惠券商店","Купоны действуют на одну оплату подписки, скидки не суммируются.":"优惠券仅适用于一次订阅付款，折扣不可叠加。","Купон −10%":"−10% 优惠券","Купон −20%":"−20% 优惠券","800 монет":"800 金币","4 000 монет":"4,000 金币","Доступно купонов: 10% — {c10}, 20% — {c20}.":"可用优惠券：10% — {c10}，20% — {c20}。","PRO: осталось {remaining} из {limit} запросов в этом месяце":"PRO：本月还剩 {remaining}/{limit} 次请求","Купленные запросы: {credits}":"已购买请求：{credits}","50 запросов · $2,99 USDT":"50 次请求 · 2.99 USDT","150 запросов · $4,99 USDT":"150 次请求 · 4.99 USDT","30 запросов/мес. в PRO":"PRO 每月 30 次请求","Например: почему в этом месяце расходы выросли?":"例如：为什么我这个月的支出增加了？","Для ответа отправляется только краткая сводка бюджета и последние операции. Переписка не сохраняется на сервере.":"回答时仅发送简要预算摘要和最近的交易记录。对话不会保存在服务器上。","Импорт выписки":"导入账单","CSV / Excel из любого банка":"支持任意银行的 CSV / Excel","SEASONAL REWARDS":"赛季奖励","Сезон":"赛季","Выполнение заданий":"任务进度","Бесплатный":"免费","PRO · платный":"PRO · 付费","Бесплатные награды — меньше купонов, но доступны всем.":"免费奖励包含较少优惠券，但所有人均可领取。","Твоя экономия за год":"全年可节省","≈ $7.08 в месяц при годовой оплате":"按年付款时每月约 7.08 美元","BEST VALUE":"超值优惠","PREMIUM EXPERIENCE":"高级体验"}};
const AUDIT_TRANSLATIONS = {"ru":{"Первый шаг":"Первый шаг","Пригласи 1 пользователя":"Пригласи 1 пользователя","Зови друзей":"Зови друзей","Пригласи 3 пользователей":"Пригласи 3 пользователей","Первая подписка":"Первая подписка","1 реферал оплачивает подписку":"1 реферал оплачивает подписку","Оборот растёт":"Оборот растёт","Рефералы оплатили на $10":"Рефералы оплатили на $10","Своя команда":"Своя команда","Пригласи 5 пользователей":"Пригласи 5 пользователей","Команда платит":"Команда платит","3 реферала оплатили подписку":"3 реферала оплатили подписку","Первые $25":"Первые $25","Рефералы оплатили на $25":"Рефералы оплатили на $25","Организатор":"Организатор","Пригласи 10 пользователей":"Пригласи 10 пользователей","Пять подписок":"Пять подписок","5 платных рефералов":"5 платных рефералов","Оборот $50":"Оборот $50","Рефералы оплатили на $50":"Рефералы оплатили на $50"},"uk":{"Первый шаг":"Перший крок","Пригласи 1 пользователя":"Запроси 1 користувача","Зови друзей":"Клич друзів","Пригласи 3 пользователей":"Запроси 3 користувачів","Первая подписка":"Перша підписка","1 реферал оплачивает подписку":"1 реферал оплачує підписку","Оборот растёт":"Оборот зростає","Рефералы оплатили на $10":"Реферали оплатили на $10","Своя команда":"Власна команда","Пригласи 5 пользователей":"Запроси 5 користувачів","Команда платит":"Команда платить","3 реферала оплатили подписку":"3 реферали оплатили підписку","Первые $25":"Перші $25","Рефералы оплатили на $25":"Реферали оплатили на $25","Организатор":"Організатор","Пригласи 10 пользователей":"Запроси 10 користувачів","Пять подписок":"П’ять підписок","5 платных рефералов":"5 платних рефералів","Оборот $50":"Оборот $50","Рефералы оплатили на $50":"Реферали оплатили на $50"},"en":{"Первый шаг":"First step","Пригласи 1 пользователя":"Invite 1 user","Зови друзей":"Invite friends","Пригласи 3 пользователей":"Invite 3 users","Первая подписка":"First subscription","1 реферал оплачивает подписку":"1 referral pays for a subscription","Оборот растёт":"Growing volume","Рефералы оплатили на $10":"Referrals paid $10","Своя команда":"Your team","Пригласи 5 пользователей":"Invite 5 users","Команда платит":"The team pays","3 реферала оплатили подписку":"3 referrals paid for subscriptions","Первые $25":"First $25","Рефералы оплатили на $25":"Referrals paid $25","Организатор":"Organizer","Пригласи 10 пользователей":"Invite 10 users","Пять подписок":"Five subscriptions","5 платных рефералов":"5 paying referrals","Оборот $50":"$50 in volume","Рефералы оплатили на $50":"Referrals paid $50"},"de":{"Первый шаг":"Erster Schritt","Пригласи 1 пользователя":"Lade 1 Nutzer ein","Зови друзей":"Freunde einladen","Пригласи 3 пользователей":"Lade 3 Nutzer ein","Первая подписка":"Erstes Abo","1 реферал оплачивает подписку":"1 Empfehlung bezahlt ein Abo","Оборот растёт":"Umsatz wächst","Рефералы оплатили на $10":"Empfehlungen zahlten 10 $","Своя команда":"Dein Team","Пригласи 5 пользователей":"Lade 5 Nutzer ein","Команда платит":"Das Team zahlt","3 реферала оплатили подписку":"3 Empfehlungen bezahlten Abos","Первые $25":"Erste 25 $","Рефералы оплатили на $25":"Empfehlungen zahlten 25 $","Организатор":"Organisator","Пригласи 10 пользователей":"Lade 10 Nutzer ein","Пять подписок":"Fünf Abos","5 платных рефералов":"5 zahlende Empfehlungen","Оборот $50":"50 $ Umsatz","Рефералы оплатили на $50":"Empfehlungen zahlten 50 $"},"es":{"Первый шаг":"Primer paso","Пригласи 1 пользователя":"Invita a 1 usuario","Зови друзей":"Invita a tus amigos","Пригласи 3 пользователей":"Invita a 3 usuarios","Первая подписка":"Primera suscripción","1 реферал оплачивает подписку":"1 referido paga una suscripción","Оборот растёт":"El volumen crece","Рефералы оплатили на $10":"Los referidos pagaron 10 $","Своя команда":"Tu equipo","Пригласи 5 пользователей":"Invita a 5 usuarios","Команда платит":"El equipo paga","3 реферала оплатили подписку":"3 referidos pagaron suscripciones","Первые $25":"Primeros 25 $","Рефералы оплатили на $25":"Los referidos pagaron 25 $","Организатор":"Organizador","Пригласи 10 пользователей":"Invita a 10 usuarios","Пять подписок":"Cinco suscripciones","5 платных рефералов":"5 referidos de pago","Оборот $50":"50 $ de volumen","Рефералы оплатили на $50":"Los referidos pagaron 50 $"},"fr":{"Первый шаг":"Premier pas","Пригласи 1 пользователя":"Invite 1 utilisateur","Зови друзей":"Invite tes amis","Пригласи 3 пользователей":"Invite 3 utilisateurs","Первая подписка":"Premier abonnement","1 реферал оплачивает подписку":"1 filleul paie un abonnement","Оборот растёт":"Le volume augmente","Рефералы оплатили на $10":"Les filleuls ont payé 10 $","Своя команда":"Votre équipe","Пригласи 5 пользователей":"Invite 5 utilisateurs","Команда платит":"L’équipe paie","3 реферала оплатили подписку":"3 filleuls ont payé des abonnements","Первые $25":"Premiers 25 $","Рефералы оплатили на $25":"Les filleuls ont payé 25 $","Организатор":"Organisateur","Пригласи 10 пользователей":"Invite 10 utilisateurs","Пять подписок":"Cinq abonnements","5 платных рефералов":"5 filleuls payants","Оборот $50":"50 $ de volume","Рефералы оплатили на $50":"Les filleuls ont payé 50 $"},"it":{"Первый шаг":"Primo passo","Пригласи 1 пользователя":"Invita 1 utente","Зови друзей":"Invita gli amici","Пригласи 3 пользователей":"Invita 3 utenti","Первая подписка":"Primo abbonamento","1 реферал оплачивает подписку":"1 referral paga un abbonamento","Оборот растёт":"Il volume cresce","Рефералы оплатили на $10":"I referral hanno pagato 10 $","Своя команда":"La tua squadra","Пригласи 5 пользователей":"Invita 5 utenti","Команда платит":"La squadra paga","3 реферала оплатили подписку":"3 referral hanno pagato gli abbonamenti","Первые $25":"Primi 25 $","Рефералы оплатили на $25":"I referral hanno pagato 25 $","Организатор":"Organizzatore","Пригласи 10 пользователей":"Invita 10 utenti","Пять подписок":"Cinque abbonamenti","5 платных рефералов":"5 referral paganti","Оборот $50":"50 $ di volume","Рефералы оплатили на $50":"I referral hanno pagato 50 $"},"pl":{"Первый шаг":"Pierwszy krok","Пригласи 1 пользователя":"Zaproś 1 użytkownika","Зови друзей":"Zapraszaj znajomych","Пригласи 3 пользователей":"Zaproś 3 użytkowników","Первая подписка":"Pierwsza subskrypcja","1 реферал оплачивает подписку":"1 polecony opłaca subskrypcję","Оборот растёт":"Obroty rosną","Рефералы оплатили на $10":"Poleceni zapłacili 10 $","Своя команда":"Twoja drużyna","Пригласи 5 пользователей":"Zaproś 5 użytkowników","Команда платит":"Drużyna płaci","3 реферала оплатили подписку":"3 poleconych opłaciło subskrypcje","Первые $25":"Pierwsze 25 $","Рефералы оплатили на $25":"Poleceni zapłacili 25 $","Организатор":"Organizator","Пригласи 10 пользователей":"Zaproś 10 użytkowników","Пять подписок":"Pięć subskrypcji","5 платных рефералов":"5 płacących poleconych","Оборот $50":"50 $ obrotu","Рефералы оплатили на $50":"Poleceni zapłacili 50 $"},"tr":{"Первый шаг":"İlk adım","Пригласи 1 пользователя":"1 kullanıcı davet et","Зови друзей":"Arkadaşlarını davet et","Пригласи 3 пользователей":"3 kullanıcı davet et","Первая подписка":"İlk abonelik","1 реферал оплачивает подписку":"1 davet edilen kullanıcı abonelik ödüyor","Оборот растёт":"Hacim artıyor","Рефералы оплатили на $10":"Davetliler 10 $ ödeme yaptı","Своя команда":"Kendi ekibin","Пригласи 5 пользователей":"5 kullanıcı davet et","Команда платит":"Ekip ödeme yapıyor","3 реферала оплатили подписку":"3 davetli abonelik ödedi","Первые $25":"İlk 25 $","Рефералы оплатили на $25":"Davetliler 25 $ ödeme yaptı","Организатор":"Organizatör","Пригласи 10 пользователей":"10 kullanıcı davet et","Пять подписок":"Beş abonelik","5 платных рефералов":"5 ödeme yapan davetli","Оборот $50":"50 $ hacim","Рефералы оплатили на $50":"Davetliler 50 $ ödeme yaptı"},"zh":{"Первый шаг":"第一步","Пригласи 1 пользователя":"邀请 1 位用户","Зови друзей":"邀请好友","Пригласи 3 пользователей":"邀请 3 位用户","Первая подписка":"首次订阅","1 реферал оплачивает подписку":"1 位推荐用户支付订阅费用","Оборот растёт":"交易额增长","Рефералы оплатили на $10":"推荐用户已支付 10 美元","Своя команда":"你的团队","Пригласи 5 пользователей":"邀请 5 位用户","Команда платит":"团队开始付费","3 реферала оплатили подписку":"3 位推荐用户已支付订阅费用","Первые $25":"首个 25 美元","Рефералы оплатили на $25":"推荐用户已支付 25 美元","Организатор":"组织者","Пригласи 10 пользователей":"邀请 10 位用户","Пять подписок":"五笔订阅","5 платных рефералов":"5 位付费推荐用户","Оборот $50":"50 美元交易额","Рефералы оплатили на $50":"推荐用户已支付 50 美元"}};

function t(k){ const lang=String(appData?.lang||'ru').toLowerCase().split('-')[0]; return (TRANSLATIONS[lang] && TRANSLATIONS[lang][k]) || (EXTRA_UI_TRANSLATIONS[lang] && EXTRA_UI_TRANSLATIONS[lang][k]) || (EXTRA_TRANSLATIONS[lang] && EXTRA_TRANSLATIONS[lang][k]) || (AUDIT_TRANSLATIONS[lang] && AUDIT_TRANSLATIONS[lang][k]) || (STATIC_UI_TRANSLATIONS[lang] && STATIC_UI_TRANSLATIONS[lang][k]) || (TRANSLATIONS.ru && TRANSLATIONS.ru[k]) || (EXTRA_UI_TRANSLATIONS.ru && EXTRA_UI_TRANSLATIONS.ru[k]) || (EXTRA_TRANSLATIONS.ru && EXTRA_TRANSLATIONS.ru[k]) || (AUDIT_TRANSLATIONS.ru && AUDIT_TRANSLATIONS.ru[k]) || (STATIC_UI_TRANSLATIONS.ru && STATIC_UI_TRANSLATIONS.ru[k]) || k; }

function tCurrency(id){ return t('currency_'+id); }

function fmtMoney(v){
  const c = CURRENCIES.find(x => x.id === appData.currency) || CURRENCIES[0];
  const n = Number(v||0).toLocaleString(appData.lang, { maximumFractionDigits: 2 });
  return ['$','£','€'].includes(c.sym) ? `${c.sym}${n}` : `${n} ${c.sym}`;
}

// Translate hard-coded interface text as well as elements explicitly marked with data-i18n.
const _autoTextOriginals = new WeakMap();
const _autoAttributeOriginals = new WeakMap();
let _autoTextObserver = null;
const AUTO_TRANSLATABLE_ATTRIBUTES = ['placeholder','title','aria-label','alt','value'];

const STATIC_UI_TRANSLATIONS = {
  ru: {"Для личного бюджета: учёт доходов и расходов, история, конверты, цели и регулярные платежи":"Для личного бюджета: учёт доходов и расходов, история, конверты, цели и регулярные платежи","Все возможности Basic плюс текстовый ввод операций, семейный бюджет и расширенная аналитика":"Все возможности Basic плюс текстовый ввод операций, семейный бюджет и расширенная аналитика","Весь набор Basic для ежедневного учёта денег":"Весь набор Basic для ежедневного учёта денег","⚡ Всегда под рукой":"⚡ Всегда под рукой","Работает внутри Telegram — не нужно устанавливать отдельное приложение.":"Работает внутри Telegram — не нужно устанавливать отдельное приложение.","📊 Финансы в одном месте":"📊 Финансы в одном месте","Доходы, расходы, история операций и аналитика собраны вместе.":"Доходы, расходы, история операций и аналитика собраны вместе.","🎯 Под твой стиль":"🎯 Под твой стиль","Несколько валют, категории, конверты и финансовые цели помогают организовать бюджет.":"Несколько валют, категории, конверты и финансовые цели помогают организовать бюджет.","🔎 Больше ясности":"🔎 Больше ясности","Отслеживай траты и замечай, куда уходят деньги.":"Отслеживай траты и замечай, куда уходят деньги.","💎 Больше возможностей с PRO":"💎 Больше возможностей с PRO","Свои категории, персональный фон, Excel-отчёты и ежедневные напоминания.":"Свои категории, персональный фон, Excel-отчёты и ежедневные напоминания.","🎁 Выгодный старт":"🎁 Выгодный старт","30 дней пробного доступа для новых пользователей, а также купоны и скидки.":"30 дней пробного доступа для новых пользователей, а также купоны и скидки.","Попробуй «Семейный бюджет» в деле":"Попробуй «Семейный бюджет» в деле","Выбери подходящий тариф или начни с пробного периода.":"Выбери подходящий тариф или начни с пробного периода.","💎 Посмотреть тарифы":"💎 Посмотреть тарифы","Личный":"Личный","Семейный":"Семейный","Личный баланс":"Личный баланс","Прогноз":"Прогноз","Доход":"Доход","Расход":"Расход","История":"История","Все участники":"Все участники","Проверяю баланс ИИ-запросов…":"Проверяю баланс ИИ-запросов…","Пакеты доступны и без подписки PRO.":"Пакеты доступны и без подписки PRO.","Купоны 10%":"Купоны 10%","Купоны 20%":"Купоны 20%","Новый сезон начинается каждый месяц. Заработанные купоны сохраняются и после завершения сезона.":"Новый сезон начинается каждый месяц. Заработанные купоны сохраняются и после завершения сезона.","Загружаем награды…":"Загружаем награды…","Правил нет":"Правил нет","Добавить":"Добавить","Проверяем семейную группу…":"Проверяем семейную группу…","Моя семья":"Моя семья","＋ Создать семью":"＋ Создать семью","Вступить по коду":"Вступить по коду","Экспорт":"Экспорт","Своя":"Своя","Семейный бюджет — справка":"Семейный бюджет — справка"},
  en: {"Для личного бюджета: учёт доходов и расходов, история, конверты, цели и регулярные платежи":"For personal budgeting: income and expenses, history, envelopes, goals, and recurring payments","Все возможности Basic плюс текстовый ввод операций, семейный бюджет и расширенная аналитика":"Everything in Basic, plus text entry, family budgeting, and advanced analytics","Весь набор Basic для ежедневного учёта денег":"Everything in Basic for everyday money tracking","⚡ Всегда под рукой":"⚡ Always at hand","Работает внутри Telegram — не нужно устанавливать отдельное приложение.":"Works inside Telegram — no separate app installation needed.","📊 Финансы в одном месте":"📊 All your finances in one place","Доходы, расходы, история операций и аналитика собраны вместе.":"Income, expenses, transaction history, and analytics in one place.","🎯 Под твой стиль":"🎯 Your way","Несколько валют, категории, конверты и финансовые цели помогают организовать бюджет.":"Multiple currencies, categories, envelopes, and financial goals help organize your budget.","🔎 Больше ясности":"🔎 More clarity","Отслеживай траты и замечай, куда уходят деньги.":"Track spending and see where your money goes.","💎 Больше возможностей с PRO":"💎 More with PRO","Свои категории, персональный фон, Excel-отчёты и ежедневные напоминания.":"Custom categories, personal backgrounds, Excel reports, and daily reminders.","🎁 Выгодный старт":"🎁 A rewarding start","30 дней пробного доступа для новых пользователей, а также купоны и скидки.":"30-day trial for new users, plus coupons and discounts.","Попробуй «Семейный бюджет» в деле":"Try Family Budget","Выбери подходящий тариф или начни с пробного периода.":"Choose a plan or start with the free trial.","💎 Посмотреть тарифы":"💎 View plans","Личный":"Personal","Семейный":"Family","Личный баланс":"Personal balance","Прогноз":"Forecast","Доход":"Income","Расход":"Expense","История":"History","Все участники":"All members","Проверяю баланс ИИ-запросов…":"Checking AI request balance…","Пакеты доступны и без подписки PRO.":"AI packs are available without a PRO subscription.","Купоны 10%":"10% coupons","Купоны 20%":"20% coupons","Новый сезон начинается каждый месяц. Заработанные купоны сохраняются и после завершения сезона.":"A new season starts every month. Earned coupons remain yours after the season ends.","Загружаем награды…":"Loading rewards…","Правил нет":"No rules yet","Добавить":"Add","Проверяем семейную группу…":"Checking family group…","Моя семья":"My family","＋ Создать семью":"＋ Create family","Вступить по коду":"Join with a code","Экспорт":"Export","Своя":"Custom","Семейный бюджет — справка":"Family Budget help"},
  uk: {"Для личного бюджета: учёт доходов и расходов, история, конверты, цели и регулярные платежи":"Для особистого бюджету: облік доходів і витрат, історія, конверти, цілі та регулярні платежі","Все возможности Basic плюс текстовый ввод операций, семейный бюджет и расширенная аналитика":"Усі можливості Basic, а також текстове введення операцій, сімейний бюджет і розширена аналітика","Весь набор Basic для ежедневного учёта денег":"Усі можливості Basic для щоденного обліку грошей","⚡ Всегда под рукой":"⚡ Завжди під рукою","Работает внутри Telegram — не нужно устанавливать отдельное приложение.":"Працює всередині Telegram — не потрібно встановлювати окремий застосунок.","📊 Финансы в одном месте":"📊 Фінанси в одному місці","Доходы, расходы, история операций и аналитика собраны вместе.":"Доходи, витрати, історія операцій та аналітика зібрані разом.","🎯 Под твой стиль":"🎯 Під твій стиль","Несколько валют, категории, конверты и финансовые цели помогают организовать бюджет.":"Кілька валют, категорії, конверти та фінансові цілі допомагають організувати бюджет.","🔎 Больше ясности":"🔎 Більше ясності","Отслеживай траты и замечай, куда уходят деньги.":"Відстежуй витрати й помічай, куди йдуть гроші.","💎 Больше возможностей с PRO":"💎 Більше можливостей із PRO","Свои категории, персональный фон, Excel-отчёты и ежедневные напоминания.":"Власні категорії, персональне тло, звіти Excel і щоденні нагадування.","🎁 Выгодный старт":"🎁 Вигідний старт","30 дней пробного доступа для новых пользователей, а также купоны и скидки.":"30 днів пробного доступу для нових користувачів, а також купони та знижки.","Попробуй «Семейный бюджет» в деле":"Спробуй «Сімейний бюджет» у дії","Выбери подходящий тариф или начни с пробного периода.":"Обери тариф або почни з пробного періоду.","💎 Посмотреть тарифы":"💎 Переглянути тарифи","Личный":"Особистий","Семейный":"Сімейний","Личный баланс":"Особистий баланс","Прогноз":"Прогноз","Доход":"Дохід","Расход":"Витрата","История":"Історія","Все участники":"Усі учасники","Проверяю баланс ИИ-запросов…":"Перевіряю баланс ШІ-запитів…","Пакеты доступны и без подписки PRO.":"Пакети доступні й без підписки PRO.","Купоны 10%":"Купони 10%","Купоны 20%":"Купони 20%","Новый сезон начинается каждый месяц. Заработанные купоны сохраняются и после завершения сезона.":"Новий сезон починається щомісяця. Зароблені купони залишаються після завершення сезону.","Загружаем награды…":"Завантажуємо нагороди…","Правил нет":"Правил немає","Добавить":"Додати","Проверяем семейную группу…":"Перевіряємо сімейну групу…","Моя семья":"Моя сім’я","＋ Создать семью":"＋ Створити сім’ю","Вступить по коду":"Приєднатися за кодом","Экспорт":"Експорт","Своя":"Власна","Семейный бюджет — справка":"Довідка «Сімейний бюджет»"},
  de: {"Для личного бюджета: учёт доходов и расходов, история, конверты, цели и регулярные платежи":"Für dein persönliches Budget: Einnahmen und Ausgaben, Verlauf, Umschläge, Ziele und regelmäßige Zahlungen","Все возможности Basic плюс текстовый ввод операций, семейный бюджет и расширенная аналитика":"Alle Basic-Funktionen plus Texteingabe, Familienbudget und erweiterte Analysen","Весь набор Basic для ежедневного учёта денег":"Alle Basic-Funktionen für die tägliche Finanzverwaltung","⚡ Всегда под рукой":"⚡ Immer griffbereit","Работает внутри Telegram — не нужно устанавливать отдельное приложение.":"Funktioniert direkt in Telegram – keine separate App erforderlich.","📊 Финансы в одном месте":"📊 Alle Finanzen an einem Ort","Доходы, расходы, история операций и аналитика собраны вместе.":"Einnahmen, Ausgaben, Verlauf und Analysen an einem Ort.","🎯 Под твой стиль":"🎯 Nach deinem Stil","Несколько валют, категории, конверты и финансовые цели помогают организовать бюджет.":"Mehrere Währungen, Kategorien, Umschläge und Sparziele helfen bei der Budgetplanung.","🔎 Больше ясности":"🔎 Mehr Überblick","Отслеживай траты и замечай, куда уходят деньги.":"Verfolge deine Ausgaben und erkenne, wohin dein Geld fließt.","💎 Больше возможностей с PRO":"💎 Mehr Möglichkeiten mit PRO","Свои категории, персональный фон, Excel-отчёты и ежедневные напоминания.":"Eigene Kategorien, persönlicher Hintergrund, Excel-Berichte und tägliche Erinnerungen.","🎁 Выгодный старт":"🎁 Ein guter Start","30 дней пробного доступа для новых пользователей, а также купоны и скидки.":"30 Tage Testzugang für neue Nutzer sowie Gutscheine und Rabatte.","Попробуй «Семейный бюджет» в деле":"Probiere Family Budget aus","Выбери подходящий тариф или начни с пробного периода.":"Wähle einen Tarif oder starte mit dem Testzeitraum.","💎 Посмотреть тарифы":"💎 Tarife ansehen","Личный":"Persönlich","Семейный":"Familie","Личный баланс":"Persönlicher Kontostand","Прогноз":"Prognose","Доход":"Einnahme","Расход":"Ausgabe","История":"Verlauf","Все участники":"Alle Mitglieder","Проверяю баланс ИИ-запросов…":"KI-Anfragekontingent wird geprüft…","Пакеты доступны и без подписки PRO.":"Pakete sind auch ohne PRO-Abo verfügbar.","Купоны 10%":"10-%-Gutscheine","Купоны 20%":"20-%-Gutscheine","Новый сезон начинается каждый месяц. Заработанные купоны сохраняются и после завершения сезона.":"Jeden Monat beginnt eine neue Saison. Verdiente Gutscheine bleiben auch nach Saisonende erhalten.","Загружаем награды…":"Belohnungen werden geladen…","Правил нет":"Keine Regeln vorhanden","Добавить":"Hinzufügen","Проверяем семейную группу…":"Familiengruppe wird geprüft…","Моя семья":"Meine Familie","＋ Создать семью":"＋ Familie erstellen","Вступить по коду":"Mit Code beitreten","Экспорт":"Export","Своя":"Eigene","Семейный бюджет — справка":"Family Budget – Hilfe"},
  es: {"Для личного бюджета: учёт доходов и расходов, история, конверты, цели и регулярные платежи":"Para tu presupuesto personal: ingresos y gastos, historial, sobres, objetivos y pagos periódicos","Все возможности Basic плюс текстовый ввод операций, семейный бюджет и расширенная аналитика":"Todo lo de Basic, además de entrada de operaciones por texto, presupuesto familiar y análisis avanzado","Весь набор Basic для ежедневного учёта денег":"Todas las funciones de Basic para gestionar tu dinero a diario","⚡ Всегда под рукой":"⚡ Siempre a mano","Работает внутри Telegram — не нужно устанавливать отдельное приложение.":"Funciona dentro de Telegram: no necesitas instalar otra aplicación.","📊 Финансы в одном месте":"📊 Tus finanzas en un solo lugar","Доходы, расходы, история операций и аналитика собраны вместе.":"Ingresos, gastos, historial y análisis, todo junto.","🎯 Под твой стиль":"🎯 A tu manera","Несколько валют, категории, конверты и финансовые цели помогают организовать бюджет.":"Varias monedas, categorías, sobres y objetivos financieros para organizar tu presupuesto.","🔎 Больше ясности":"🔎 Más claridad","Отслеживай траты и замечай, куда уходят деньги.":"Controla tus gastos y descubre adónde va tu dinero.","💎 Больше возможностей с PRO":"💎 Más funciones con PRO","Свои категории, персональный фон, Excel-отчёты и ежедневные напоминания.":"Categorías personalizadas, fondos propios, informes Excel y recordatorios diarios.","🎁 Выгодный старт":"🎁 Un comienzo ventajoso","30 дней пробного доступа для новых пользователей, а также купоны и скидки.":"30 días de prueba para nuevos usuarios, además de cupones y descuentos.","Попробуй «Семейный бюджет» в деле":"Prueba Family Budget","Выбери подходящий тариф или начни с пробного периода.":"Elige un plan o empieza con el periodo de prueba.","💎 Посмотреть тарифы":"💎 Ver planes","Личный":"Personal","Семейный":"Familiar","Личный баланс":"Saldo personal","Прогноз":"Previsión","Доход":"Ingreso","Расход":"Gasto","История":"Historial","Все участники":"Todos los miembros","Проверяю баланс ИИ-запросов…":"Comprobando el saldo de consultas de IA…","Пакеты доступны и без подписки PRO.":"Los paquetes están disponibles incluso sin PRO.","Купоны 10%":"Cupones del 10%","Купоны 20%":"Cupones del 20%","Новый сезон начинается каждый месяц. Заработанные купоны сохраняются и после завершения сезона.":"Cada mes comienza una nueva temporada. Los cupones obtenidos se conservan al terminarla.","Загружаем награды…":"Cargando recompensas…","Правил нет":"No hay reglas","Добавить":"Añadir","Проверяем семейную группу…":"Comprobando el grupo familiar…","Моя семья":"Mi familia","＋ Создать семью":"＋ Crear familia","Вступить по коду":"Unirse con un código","Экспорт":"Exportar","Своя":"Personalizada","Семейный бюджет — справка":"Ayuda de Family Budget"},
  fr: {"Для личного бюджета: учёт доходов и расходов, история, конверты, цели и регулярные платежи":"Pour ton budget personnel : revenus et dépenses, historique, enveloppes, objectifs et paiements récurrents","Все возможности Basic плюс текстовый ввод операций, семейный бюджет и расширенная аналитика":"Toutes les fonctions Basic, plus la saisie par texte, le budget familial et des analyses avancées","Весь набор Basic для ежедневного учёта денег":"Toutes les fonctions Basic pour gérer ton argent au quotidien","⚡ Всегда под рукой":"⚡ Toujours à portée de main","Работает внутри Telegram — не нужно устанавливать отдельное приложение.":"Fonctionne dans Telegram : aucune autre application à installer.","📊 Финансы в одном месте":"📊 Toutes tes finances au même endroit","Доходы, расходы, история операций и аналитика собраны вместе.":"Revenus, dépenses, historique et analyses réunis au même endroit.","🎯 Под твой стиль":"🎯 À ton image","Несколько валют, категории, конверты и финансовые цели помогают организовать бюджет.":"Plusieurs devises, catégories, enveloppes et objectifs pour organiser ton budget.","🔎 Больше ясности":"🔎 Plus de visibilité","Отслеживай траты и замечай, куда уходят деньги.":"Suis tes dépenses et vois où va ton argent.","💎 Больше возможностей с PRO":"💎 Plus de possibilités avec PRO","Свои категории, персональный фон, Excel-отчёты и ежедневные напоминания.":"Catégories personnalisées, arrière-plan personnel, rapports Excel et rappels quotidiens.","🎁 Выгодный старт":"🎁 Un bon départ","30 дней пробного доступа для новых пользователей, а также купоны и скидки.":"30 jours d’essai pour les nouveaux utilisateurs, ainsi que des coupons et des réductions.","Попробуй «Семейный бюджет» в деле":"Découvre Family Budget","Выбери подходящий тариф или начни с пробного периода.":"Choisis une offre ou commence par la période d’essai.","💎 Посмотреть тарифы":"💎 Voir les offres","Личный":"Personnel","Семейный":"Famille","Личный баланс":"Solde personnel","Прогноз":"Prévision","Доход":"Revenu","Расход":"Dépense","История":"Historique","Все участники":"Tous les membres","Проверяю баланс ИИ-запросов…":"Vérification du solde des requêtes IA…","Пакеты доступны и без подписки PRO.":"Les packs sont disponibles même sans abonnement PRO.","Купоны 10%":"Coupons de 10 %","Купоны 20%":"Coupons de 20 %","Новый сезон начинается каждый месяц. Заработанные купоны сохраняются и после завершения сезона.":"Une nouvelle saison commence chaque mois. Les coupons gagnés restent acquis après la saison.","Загружаем награды…":"Chargement des récompenses…","Правил нет":"Aucune règle","Добавить":"Ajouter","Проверяем семейную группу…":"Vérification du groupe familial…","Моя семья":"Ma famille","＋ Создать семью":"＋ Créer une famille","Вступить по коду":"Rejoindre avec un code","Экспорт":"Exporter","Своя":"Personnalisée","Семейный бюджет — справка":"Aide Family Budget"},
  it: {"Для личного бюджета: учёт доходов и расходов, история, конверты, цели и регулярные платежи":"Per il budget personale: entrate e uscite, cronologia, buste, obiettivi e pagamenti ricorrenti","Все возможности Basic плюс текстовый ввод операций, семейный бюджет и расширенная аналитика":"Tutte le funzioni Basic, più inserimento testuale, budget familiare e analisi avanzate","Весь набор Basic для ежедневного учёта денег":"Tutte le funzioni Basic per gestire il denaro ogni giorno","⚡ Всегда под рукой":"⚡ Sempre a portata di mano","Работает внутри Telegram — не нужно устанавливать отдельное приложение.":"Funziona dentro Telegram: non serve installare un’altra app.","📊 Финансы в одном месте":"📊 Tutte le finanze in un unico posto","Доходы, расходы, история операций и аналитика собраны вместе.":"Entrate, uscite, cronologia e analisi sono raccolte insieme.","🎯 Под твой стиль":"🎯 A modo tuo","Несколько валют, категории, конверты и финансовые цели помогают организовать бюджет.":"Più valute, categorie, buste e obiettivi finanziari per organizzare il budget.","🔎 Больше ясности":"🔎 Più chiarezza","Отслеживай траты и замечай, куда уходят деньги.":"Monitora le spese e scopri dove finiscono i tuoi soldi.","💎 Больше возможностей с PRO":"💎 Più funzioni con PRO","Свои категории, персональный фон, Excel-отчёты и ежедневные напоминания.":"Categorie personalizzate, sfondi personali, report Excel e promemoria quotidiani.","🎁 Выгодный старт":"🎁 Un inizio vantaggioso","30 дней пробного доступа для новых пользователей, а также купоны и скидки.":"30 giorni di prova per i nuovi utenti, oltre a coupon e sconti.","Попробуй «Семейный бюджет» в деле":"Prova Family Budget","Выбери подходящий тариф или начни с пробного периода.":"Scegli un piano o inizia con il periodo di prova.","💎 Посмотреть тарифы":"💎 Vedi i piani","Личный":"Personale","Семейный":"Familiare","Личный баланс":"Saldo personale","Прогноз":"Previsione","Доход":"Entrata","Расход":"Uscita","История":"Cronologia","Все участники":"Tutti i membri","Проверяю баланс ИИ-запросов…":"Controllo del saldo delle richieste IA…","Пакеты доступны и без подписки PRO.":"I pacchetti sono disponibili anche senza abbonamento PRO.","Купоны 10%":"Coupon 10%","Купоны 20%":"Coupon 20%","Новый сезон начинается каждый месяц. Заработанные купоны сохраняются и после завершения сезона.":"Ogni mese inizia una nuova stagione. I coupon guadagnati restano disponibili anche dopo la fine della stagione.","Загружаем награды…":"Caricamento dei premi…","Правил нет":"Nessuna regola","Добавить":"Aggiungi","Проверяем семейную группу…":"Controllo del gruppo familiare…","Моя семья":"La mia famiglia","＋ Создать семью":"＋ Crea famiglia","Вступить по коду":"Entra con un codice","Экспорт":"Esporta","Своя":"Personalizzata","Семейный бюджет — справка":"Guida di Family Budget"},
  pl: {"Для личного бюджета: учёт доходов и расходов, история, конверты, цели и регулярные платежи":"Do budżetu osobistego: przychody i wydatki, historia, koperty, cele i płatności cykliczne","Все возможности Basic плюс текстовый ввод операций, семейный бюджет и расширенная аналитика":"Wszystkie funkcje Basic oraz wpisywanie operacji tekstem, budżet rodzinny i zaawansowana analityka","Весь набор Basic для ежедневного учёта денег":"Wszystkie funkcje Basic do codziennego zarządzania pieniędzmi","⚡ Всегда под рукой":"⚡ Zawsze pod ręką","Работает внутри Telegram — не нужно устанавливать отдельное приложение.":"Działa w Telegramie — nie musisz instalować osobnej aplikacji.","📊 Финансы в одном месте":"📊 Finanse w jednym miejscu","Доходы, расходы, история операций и аналитика собраны вместе.":"Przychody, wydatki, historia operacji i analityka w jednym miejscu.","🎯 Под твой стиль":"🎯 Po Twojemu","Несколько валют, категории, конверты и финансовые цели помогают организовать бюджет.":"Wiele walut, kategorie, koperty i cele finansowe pomagają uporządkować budżet.","🔎 Больше ясности":"🔎 Większa przejrzystość","Отслеживай траты и замечай, куда уходят деньги.":"Śledź wydatki i sprawdzaj, na co przeznaczasz pieniądze.","💎 Больше возможностей с PRO":"💎 Więcej możliwości z PRO","Свои категории, персональный фон, Excel-отчёты и ежедневные напоминания.":"Własne kategorie, personalne tło, raporty Excel i codzienne przypomnienia.","🎁 Выгодный старт":"🎁 Dobry początek","30 дней пробного доступа для новых пользователей, а также купоны и скидки.":"30 dni okresu próbnego dla nowych użytkowników oraz kupony i rabaty.","Попробуй «Семейный бюджет» в деле":"Wypróbuj Family Budget","Выбери подходящий тариф или начни с пробного периода.":"Wybierz plan lub rozpocznij okres próbny.","💎 Посмотреть тарифы":"💎 Zobacz plany","Личный":"Osobisty","Семейный":"Rodzinny","Личный баланс":"Saldo osobiste","Прогноз":"Prognoza","Доход":"Przychód","Расход":"Wydatek","История":"Historia","Все участники":"Wszyscy członkowie","Проверяю баланс ИИ-запросов…":"Sprawdzanie salda zapytań AI…","Пакеты доступны и без подписки PRO.":"Pakiety są dostępne także bez subskrypcji PRO.","Купоны 10%":"Kupony 10%","Купоны 20%":"Kupony 20%","Новый сезон начинается каждый месяц. Заработанные купоны сохраняются и после завершения сезона.":"Nowy sezon zaczyna się co miesiąc. Zdobyte kupony pozostają po zakończeniu sezonu.","Загружаем награды…":"Wczytywanie nagród…","Правил нет":"Brak reguł","Добавить":"Dodaj","Проверяем семейную группу…":"Sprawdzanie grupy rodzinnej…","Моя семья":"Moja rodzina","＋ Создать семью":"＋ Utwórz rodzinę","Вступить по коду":"Dołącz za pomocą kodu","Экспорт":"Eksportuj","Своя":"Własna","Семейный бюджет — справка":"Pomoc Family Budget"},
  tr: {"Для личного бюджета: учёт доходов и расходов, история, конверты, цели и регулярные платежи":"Kişisel bütçe için: gelir ve giderler, geçmiş, zarflar, hedefler ve düzenli ödemeler","Все возможности Basic плюс текстовый ввод операций, семейный бюджет и расширенная аналитика":"Basic özelliklerinin tümü, ayrıca metinle işlem girişi, aile bütçesi ve gelişmiş analiz","Весь набор Basic для ежедневного учёта денег":"Günlük para takibi için tüm Basic özellikleri","⚡ Всегда под рукой":"⚡ Her zaman elinin altında","Работает внутри Telegram — не нужно устанавливать отдельное приложение.":"Telegram içinde çalışır; ayrı bir uygulama yüklemen gerekmez.","📊 Финансы в одном месте":"📊 Tüm finansın tek yerde","Доходы, расходы, история операций и аналитика собраны вместе.":"Gelirler, giderler, işlem geçmişi ve analizler bir arada.","🎯 Под твой стиль":"🎯 Sana göre","Несколько валют, категории, конверты и финансовые цели помогают организовать бюджет.":"Birden fazla para birimi, kategoriler, zarflar ve finansal hedefler bütçeni düzenler.","🔎 Больше ясности":"🔎 Daha fazla netlik","Отслеживай траты и замечай, куда уходят деньги.":"Harcamalarını takip et ve paranı nereye harcadığını gör.","💎 Больше возможностей с PRO":"💎 PRO ile daha fazlası","Свои категории, персональный фон, Excel-отчёты и ежедневные напоминания.":"Özel kategoriler, kişisel arka plan, Excel raporları ve günlük hatırlatmalar.","🎁 Выгодный старт":"🎁 Avantajlı başlangıç","30 дней пробного доступа для новых пользователей, а также купоны и скидки.":"Yeni kullanıcılar için 30 günlük deneme süresi, ayrıca kuponlar ve indirimler.","Попробуй «Семейный бюджет» в деле":"Family Budget'ı dene","Выбери подходящий тариф или начни с пробного периода.":"Bir plan seç veya deneme süresiyle başla.","💎 Посмотреть тарифы":"💎 Planları gör","Личный":"Kişisel","Семейный":"Aile","Личный баланс":"Kişisel bakiye","Прогноз":"Tahmin","Доход":"Gelir","Расход":"Gider","История":"Geçmiş","Все участники":"Tüm üyeler","Проверяю баланс ИИ-запросов…":"Yapay zekâ istek bakiyesi kontrol ediliyor…","Пакеты доступны и без подписки PRO.":"Paketler PRO aboneliği olmadan da kullanılabilir.","Купоны 10%":"%10 kuponlar","Купоны 20%":"%20 kuponlar","Новый сезон начинается каждый месяц. Заработанные купоны сохраняются и после завершения сезона.":"Her ay yeni sezon başlar. Kazanılan kuponlar sezon bittikten sonra da kalır.","Загружаем награды…":"Ödüller yükleniyor…","Правил нет":"Kural yok","Добавить":"Ekle","Проверяем семейную группу…":"Aile grubu kontrol ediliyor…","Моя семья":"Ailem","＋ Создать семью":"＋ Aile oluştur","Вступить по коду":"Kodla katıl","Экспорт":"Dışa aktar","Своя":"Özel","Семейный бюджет — справка":"Family Budget yardımı"},
  zh: {"Для личного бюджета: учёт доходов и расходов, история, конверты, цели и регулярные платежи":"个人预算管理：收入与支出、记录、信封、目标和定期付款","Все возможности Basic плюс текстовый ввод операций, семейный бюджет и расширенная аналитика":"包含 Basic 的全部功能，并增加文字录入、家庭预算和高级分析","Весь набор Basic для ежедневного учёта денег":"日常记账所需的全部 Basic 功能","⚡ Всегда под рукой":"⚡ 随时可用","Работает внутри Telegram — не нужно устанавливать отдельное приложение.":"在 Telegram 内使用，无需安装独立应用。","📊 Финансы в одном месте":"📊 财务一目了然","Доходы, расходы, история операций и аналитика собраны вместе.":"收入、支出、交易记录和分析集中管理。","🎯 Под твой стиль":"🎯 按你的方式管理","Несколько валют, категории, конверты и финансовые цели помогают организовать бюджет.":"多种货币、分类、信封和财务目标，帮助你规划预算。","🔎 Больше ясности":"🔎 更清晰地了解财务","Отслеживай траты и замечай, куда уходят деньги.":"跟踪支出，了解资金去向。","💎 Больше возможностей с PRO":"💎 PRO 更多功能","Свои категории, персональный фон, Excel-отчёты и ежедневные напоминания.":"自定义分类、个性化背景、Excel 报告和每日提醒。","🎁 Выгодный старт":"🎁 轻松开始","30 дней пробного доступа для новых пользователей, а также купоны и скидки.":"新用户可享受 30 天试用，以及优惠券和折扣。","Попробуй «Семейный бюджет» в деле":"体验 Family Budget","Выбери подходящий тариф или начни с пробного периода.":"选择适合的方案，或从试用期开始。","💎 Посмотреть тарифы":"💎 查看订阅方案","Личный":"个人","Семейный":"家庭","Личный баланс":"个人余额","Прогноз":"预测","Доход":"收入","Расход":"支出","История":"记录","Все участники":"所有成员","Проверяю баланс ИИ-запросов…":"正在检查 AI 请求余额…","Пакеты доступны и без подписки PRO.":"无需 PRO 订阅也可购买请求包。","Купоны 10%":"10% 优惠券","Купоны 20%":"20% 优惠券","Новый сезон начинается каждый месяц. Заработанные купоны сохраняются и после завершения сезона.":"每月开启新赛季。赛季结束后，已获得的优惠券仍然有效。","Загружаем награды…":"正在加载奖励…","Правил нет":"暂无规则","Добавить":"添加","Проверяем семейную группу…":"正在检查家庭组…","Моя семья":"我的家庭","＋ Создать семью":"＋ 创建家庭","Вступить по коду":"使用邀请码加入","Экспорт":"导出","Своя":"自定义","Семейный бюджет — справка":"Family Budget 帮助"},
};

Object.assign(STATIC_UI_TRANSLATIONS.ru, {"Семейный Бюджет":"Семейный бюджет","Скидка 10%":"Скидка 10%","Скидка 20%":"Скидка 20%","Загрузка…":"Загрузка…","или 500 ⭐":"или 500 ⭐","или 1 300 ⭐":"или 1 300 ⭐","или 2 300 ⭐":"или 2 300 ⭐","или 3 900 ⭐":"или 3 900 ⭐","или 1 000 ⭐":"или 1 000 ⭐","/ год":"/ год","или 7 500 ⭐ за год":"или 7 500 ⭐ за год","0 / 10 заданий":"0 / 10 заданий","🎟️ Купон −10%":"🎟️ Купон −10%","🎟️ Купон −20%":"🎟️ Купон −20%","Тема":"Тема","1 ИИ-запрос":"1 ИИ-запрос"});
Object.assign(STATIC_UI_TRANSLATIONS.en, {"Семейный Бюджет":"Family Budget","Скидка 10%":"10% discount","Скидка 20%":"20% discount","Загрузка…":"Loading…","или 500 ⭐":"or 500 ⭐","или 1 300 ⭐":"or 1,300 ⭐","или 2 300 ⭐":"or 2,300 ⭐","или 3 900 ⭐":"or 3,900 ⭐","или 1 000 ⭐":"or 1,000 ⭐","/ год":"/ year","или 7 500 ⭐ за год":"or 7,500 ⭐ per year","0 / 10 заданий":"0 / 10 tasks","🎟️ Купон −10%":"🎟️ 10% coupon","🎟️ Купон −20%":"🎟️ 20% coupon","Тема":"Theme","1 ИИ-запрос":"1 AI request"});
Object.assign(STATIC_UI_TRANSLATIONS.uk, {"Семейный Бюджет":"Сімейний бюджет","Скидка 10%":"Знижка 10%","Скидка 20%":"Знижка 20%","Загрузка…":"Завантаження…","или 500 ⭐":"або 500 ⭐","или 1 300 ⭐":"або 1 300 ⭐","или 2 300 ⭐":"або 2 300 ⭐","или 3 900 ⭐":"або 3 900 ⭐","или 1 000 ⭐":"або 1 000 ⭐","/ год":"/ рік","или 7 500 ⭐ за год":"або 7 500 ⭐ на рік","0 / 10 заданий":"0 / 10 завдань","🎟️ Купон −10%":"🎟️ Купон −10%","🎟️ Купон −20%":"🎟️ Купон −20%","Тема":"Тема","1 ИИ-запрос":"1 ШІ-запит"});
Object.assign(STATIC_UI_TRANSLATIONS.de, {"Семейный Бюджет":"Family Budget","Скидка 10%":"10 % Rabatt","Скидка 20%":"20 % Rabatt","Загрузка…":"Wird geladen…","или 500 ⭐":"oder 500 ⭐","или 1 300 ⭐":"oder 1.300 ⭐","или 2 300 ⭐":"oder 2.300 ⭐","или 3 900 ⭐":"oder 3.900 ⭐","или 1 000 ⭐":"oder 1.000 ⭐","/ год":"/ Jahr","или 7 500 ⭐ за год":"oder 7.500 ⭐ pro Jahr","0 / 10 заданий":"0 / 10 Aufgaben","🎟️ Купон −10%":"🎟️ 10-%-Gutschein","🎟️ Купон −20%":"🎟️ 20-%-Gutschein","Тема":"Thema","1 ИИ-запрос":"1 KI-Anfrage"});
Object.assign(STATIC_UI_TRANSLATIONS.es, {"Семейный Бюджет":"Family Budget","Скидка 10%":"10 % de descuento","Скидка 20%":"20 % de descuento","Загрузка…":"Cargando…","или 500 ⭐":"o 500 ⭐","или 1 300 ⭐":"o 1.300 ⭐","или 2 300 ⭐":"o 2.300 ⭐","или 3 900 ⭐":"o 3.900 ⭐","или 1 000 ⭐":"o 1.000 ⭐","/ год":"/ año","или 7 500 ⭐ за год":"o 7.500 ⭐ al año","0 / 10 заданий":"0 / 10 tareas","🎟️ Купон −10%":"🎟️ Cupón del 10 %","🎟️ Купон −20%":"🎟️ Cupón del 20 %","Тема":"Tema","1 ИИ-запрос":"1 consulta de IA"});
Object.assign(STATIC_UI_TRANSLATIONS.fr, {"Семейный Бюджет":"Family Budget","Скидка 10%":"Réduction de 10 %","Скидка 20%":"Réduction de 20 %","Загрузка…":"Chargement…","или 500 ⭐":"ou 500 ⭐","или 1 300 ⭐":"ou 1 300 ⭐","или 2 300 ⭐":"ou 2 300 ⭐","или 3 900 ⭐":"ou 3 900 ⭐","или 1 000 ⭐":"ou 1 000 ⭐","/ год":"/ an","или 7 500 ⭐ за год":"ou 7 500 ⭐ par an","0 / 10 заданий":"0 / 10 tâches","🎟️ Купон −10%":"🎟️ Coupon de 10 %","🎟️ Купон −20%":"🎟️ Coupon de 20 %","Тема":"Thème","1 ИИ-запрос":"1 requête IA"});
Object.assign(STATIC_UI_TRANSLATIONS.it, {"Семейный Бюджет":"Family Budget","Скидка 10%":"Sconto del 10%","Скидка 20%":"Sconto del 20%","Загрузка…":"Caricamento…","или 500 ⭐":"oppure 500 ⭐","или 1 300 ⭐":"oppure 1.300 ⭐","или 2 300 ⭐":"oppure 2.300 ⭐","или 3 900 ⭐":"oppure 3.900 ⭐","или 1 000 ⭐":"oppure 1.000 ⭐","/ год":"/ anno","или 7 500 ⭐ за год":"oppure 7.500 ⭐ all’anno","0 / 10 заданий":"0 / 10 attività","🎟️ Купон −10%":"🎟️ Coupon 10%","🎟️ Купон −20%":"🎟️ Coupon 20%","Тема":"Tema","1 ИИ-запрос":"1 richiesta IA"});
Object.assign(STATIC_UI_TRANSLATIONS.pl, {"Семейный Бюджет":"Family Budget","Скидка 10%":"Rabat 10%","Скидка 20%":"Rabat 20%","Загрузка…":"Ładowanie…","или 500 ⭐":"lub 500 ⭐","или 1 300 ⭐":"lub 1 300 ⭐","или 2 300 ⭐":"lub 2 300 ⭐","или 3 900 ⭐":"lub 3 900 ⭐","или 1 000 ⭐":"lub 1 000 ⭐","/ год":"/ rok","или 7 500 ⭐ за год":"lub 7 500 ⭐ rocznie","0 / 10 заданий":"0 / 10 zadań","🎟️ Купон −10%":"🎟️ Kupon 10%","🎟️ Купон −20%":"🎟️ Kupon 20%","Тема":"Motyw","1 ИИ-запрос":"1 zapytanie AI"});
Object.assign(STATIC_UI_TRANSLATIONS.tr, {"Семейный Бюджет":"Family Budget","Скидка 10%":"%10 indirim","Скидка 20%":"%20 indirim","Загрузка…":"Yükleniyor…","или 500 ⭐":"veya 500 ⭐","или 1 300 ⭐":"veya 1.300 ⭐","или 2 300 ⭐":"veya 2.300 ⭐","или 3 900 ⭐":"veya 3.900 ⭐","или 1 000 ⭐":"veya 1.000 ⭐","/ год":"/ yıl","или 7 500 ⭐ за год":"veya yılda 7.500 ⭐","0 / 10 заданий":"0 / 10 görev","🎟️ Купон −10%":"🎟️ %10 kupon","🎟️ Купон −20%":"🎟️ %20 kupon","Тема":"Tema","1 ИИ-запрос":"1 yapay zekâ isteği"});
Object.assign(STATIC_UI_TRANSLATIONS.zh, {"Семейный Бюджет":"家庭预算","Скидка 10%":"优惠 10%","Скидка 20%":"优惠 20%","Загрузка…":"加载中…","или 500 ⭐":"或 500 ⭐","или 1 300 ⭐":"或 1,300 ⭐","или 2 300 ⭐":"或 2,300 ⭐","или 3 900 ⭐":"或 3,900 ⭐","или 1 000 ⭐":"或 1,000 ⭐","/ год":"/ 年","или 7 500 ⭐ за год":"或每年 7,500 ⭐","0 / 10 заданий":"0 / 10 个任务","🎟️ Купон −10%":"🎟️ 10% 优惠券","🎟️ Купон −20%":"🎟️ 20% 优惠券","Тема":"主题","1 ИИ-запрос":"1 次 AI 请求"});


Object.assign(STATIC_UI_TRANSLATIONS.ru, {"Найдено операций: ":"Найдено операций: "," · Пропущено строк без даты/суммы: ":" · Пропущено строк без даты/суммы: "," · Показаны первые 2000 операций.":" · Показаны первые 2000 операций.","Ошибка импорта.":"Ошибка импорта.","Операция без описания":"Операция без описания","Импорт…":"Импорт…","Не удалось импортировать семейные операции.":"Не удалось импортировать семейные операции.","Не удалось импортировать операции.":"Не удалось импортировать операции.","За один раз можно импортировать не больше 500 операций. Сними галочки с лишних строк и повтори.":"За один раз можно импортировать не больше 500 операций. Сними галочки с лишних строк и повтори.","В этой выписке несколько валют. Чтобы не исказить баланс, импортируй каждую валюту отдельным файлом.":"В этой выписке несколько валют. Чтобы не исказить баланс, импортируй каждую валюту отдельным файлом.","Валюта выписки — ":"Валюта выписки — ",", а валюта приложения — ":", а валюта приложения — ",". Сначала измени валюту приложения в Настройках на ":". Сначала измени валюту приложения в Настройках на ",", затем загрузи выписку снова.":", затем загрузи выписку снова.","Напиши, например: «потратил 350 грн на продукты».":"Напиши, например: «потратил 350 грн на продукты».","Разбираю…":"Разбираю…","ИИ разбирает описание…":"ИИ разбирает описание…","Не нашёл сумму. Укажи её в тексте, например «кофе 85 грн».":"Не нашёл сумму. Укажи её в тексте, например «кофе 85 грн».","Проверь особенно внимательно: описание неоднозначно. ":"Проверь особенно внимательно: описание неоднозначно. ","Черновик заполнен. ":"Черновик заполнен. ","Нажми «Сохранить» только после проверки.":"Нажми «Сохранить» только после проверки.","Проверь тип, сумму, описание и дату операции.":"Проверь тип, сумму, описание и дату операции.","Удалить эту семейную операцию?":"Удалить эту семейную операцию?","Удалить эту операцию?":"Удалить эту операцию?","Без конверта":"Без конверта","Изменить конверт":"Изменить конверт","Сохранить изменения":"Сохранить изменения","Новый конверт":"Новый конверт","Создать":"Создать","Изменить копилку":"Изменить копилку","Новая банка":"Новая банка","Пополнить: ":"Пополнить: ","Введи сумму больше нуля.":"Введи сумму больше нуля.","На доступном балансе недостаточно денег.":"На доступном балансе недостаточно денег.","Сохранить":"Сохранить","Открой приложение через Telegram.":"Открой приложение через Telegram.","Платёж получен. Проверяем активацию подписки.":"Платёж получен. Проверяем активацию подписки.","Оплата не прошла. Попробуй ещё раз.":"Оплата не прошла. Попробуй ещё раз.","ИИ анализирует бюджет…":"ИИ анализирует бюджет…","Открой приложение через Telegram, чтобы получать награды.":"Открой приложение через Telegram, чтобы получать награды.","Обновляю баланс купонов…":"Обновляю баланс купонов…","Не удалось обновить баланс. Попробуй ещё раз.":"Не удалось обновить баланс. Попробуй ещё раз.","Выбери купон 10% или 20%.":"Выбери купон 10% или 20%.","Импорт выписки":"Импорт выписки","CSV / Excel из любого банка":"CSV / Excel из любого банка"});
Object.assign(STATIC_UI_TRANSLATIONS.en, {"Найдено операций: ":"Transactions found: "," · Пропущено строк без даты/суммы: ":" · Rows skipped (missing date/amount): "," · Показаны первые 2000 операций.":" · First 2,000 transactions shown.","Ошибка импорта.":"Import failed.","Операция без описания":"Transaction without a description","Импорт…":"Importing…","Не удалось импортировать семейные операции.":"Could not import family transactions.","Не удалось импортировать операции.":"Could not import transactions.","За один раз можно импортировать не больше 500 операций. Сними галочки с лишних строк и повтори.":"You can import up to 500 transactions at a time. Deselect extra rows and try again.","В этой выписке несколько валют. Чтобы не исказить баланс, импортируй каждую валюту отдельным файлом.":"This statement contains multiple currencies. To avoid an incorrect balance, import each currency in a separate file.","Валюта выписки — ":"Statement currency: ",", а валюта приложения — ":", while the app currency is ",". Сначала измени валюту приложения в Настройках на ":". First change the app currency to ",", затем загрузи выписку снова.":", then upload the statement again.","Напиши, например: «потратил 350 грн на продукты».":"Try: “spent 350 UAH on groceries”.","Разбираю…":"Parsing…","ИИ разбирает описание…":"AI is parsing the description…","Не нашёл сумму. Укажи её в тексте, например «кофе 85 грн».":"No amount found. Include it in the text, for example “coffee 85 UAH”.","Проверь особенно внимательно: описание неоднозначно. ":"Please review carefully: the description is ambiguous. ","Черновик заполнен. ":"Draft filled in. ","Нажми «Сохранить» только после проверки.":"Click “Save” only after reviewing it.","Проверь тип, сумму, описание и дату операции.":"Check the transaction type, amount, description, and date.","Удалить эту семейную операцию?":"Delete this family transaction?","Удалить эту операцию?":"Delete this transaction?","Без конверта":"No envelope","Изменить конверт":"Edit envelope","Сохранить изменения":"Save changes","Новый конверт":"New envelope","Создать":"Create","Изменить копилку":"Edit savings goal","Новая банка":"New savings account","Пополнить: ":"Add funds: ","Введи сумму больше нуля.":"Enter an amount greater than zero.","На доступном балансе недостаточно денег.":"Insufficient available balance.","Сохранить":"Save","Открой приложение через Telegram.":"Open the app through Telegram.","Платёж получен. Проверяем активацию подписки.":"Payment received. Checking subscription activation.","Оплата не прошла. Попробуй ещё раз.":"Payment failed. Please try again.","ИИ анализирует бюджет…":"AI is analyzing your budget…","Открой приложение через Telegram, чтобы получать награды.":"Open the app through Telegram to claim rewards.","Обновляю баланс купонов…":"Refreshing coupon balance…","Не удалось обновить баланс. Попробуй ещё раз.":"Could not refresh the balance. Please try again.","Выбери купон 10% или 20%.":"Choose a 10% or 20% coupon.","Импорт выписки":"Import statement","CSV / Excel из любого банка":"CSV / Excel from any bank"});
Object.assign(STATIC_UI_TRANSLATIONS.uk, {"Найдено операций: ":"Знайдено операцій: "," · Пропущено строк без даты/суммы: ":" · Пропущено рядків без дати/суми: "," · Показаны первые 2000 операций.":" · Показано перші 2 000 операцій.","Ошибка импорта.":"Помилка імпорту.","Операция без описания":"Операція без опису","Импорт…":"Імпорт…","Не удалось импортировать семейные операции.":"Не вдалося імпортувати сімейні операції.","Не удалось импортировать операции.":"Не вдалося імпортувати операції.","За один раз можно импортировать не больше 500 операций. Сними галочки с лишних строк и повтори.":"За один раз можна імпортувати не більше 500 операцій. Зніми позначки з зайвих рядків і повтори.","В этой выписке несколько валют. Чтобы не исказить баланс, импортируй каждую валюту отдельным файлом.":"У цій виписці кілька валют. Щоб не спотворити баланс, імпортуй кожну валюту окремим файлом.","Валюта выписки — ":"Валюта виписки — ",", а валюта приложения — ":", а валюта застосунку — ",". Сначала измени валюту приложения в Настройках на ":". Спочатку зміни валюту застосунку в Налаштуваннях на ",", затем загрузи выписку снова.":", а потім завантаж виписку знову.","Напиши, например: «потратил 350 грн на продукты».":"Напиши, наприклад: «витратив 350 грн на продукти».","Разбираю…":"Обробляю…","ИИ разбирает описание…":"ШІ аналізує опис…","Не нашёл сумму. Укажи её в тексте, например «кофе 85 грн».":"Не знайшов суму. Вкажи її в тексті, наприклад «кава 85 грн».","Проверь особенно внимательно: описание неоднозначно. ":"Перевір особливо уважно: опис неоднозначний. ","Черновик заполнен. ":"Чернетку заповнено. ","Нажми «Сохранить» только после проверки.":"Натискай «Зберегти» лише після перевірки.","Проверь тип, сумму, описание и дату операции.":"Перевір тип, суму, опис і дату операції.","Удалить эту семейную операцию?":"Видалити цю сімейну операцію?","Удалить эту операцию?":"Видалити цю операцію?","Без конверта":"Без конверта","Изменить конверт":"Змінити конверт","Сохранить изменения":"Зберегти зміни","Новый конверт":"Новий конверт","Создать":"Створити","Изменить копилку":"Змінити скарбничку","Новая банка":"Нова скарбничка","Пополнить: ":"Поповнити: ","Введи сумму больше нуля.":"Введи суму, більшу за нуль.","На доступном балансе недостаточно денег.":"На доступному балансі недостатньо коштів.","Сохранить":"Зберегти","Открой приложение через Telegram.":"Відкрий застосунок через Telegram.","Платёж получен. Проверяем активацию подписки.":"Платіж отримано. Перевіряємо активацію підписки.","Оплата не прошла. Попробуй ещё раз.":"Оплата не пройшла. Спробуй ще раз.","ИИ анализирует бюджет…":"ШІ аналізує бюджет…","Открой приложение через Telegram, чтобы получать награды.":"Відкрий застосунок через Telegram, щоб отримувати нагороди.","Обновляю баланс купонов…":"Оновлюю баланс купонів…","Не удалось обновить баланс. Попробуй ещё раз.":"Не вдалося оновити баланс. Спробуй ще раз.","Выбери купон 10% или 20%.":"Обери купон 10% або 20%.","Импорт выписки":"Імпорт виписки","CSV / Excel из любого банка":"CSV / Excel з будь-якого банку"});
Object.assign(STATIC_UI_TRANSLATIONS.de, {"Найдено операций: ":"Gefundene Buchungen: "," · Пропущено строк без даты/суммы: ":" · Übersprungene Zeilen (Datum/Betrag fehlt): "," · Показаны первые 2000 операций.":" · Die ersten 2.000 Buchungen werden angezeigt.","Ошибка импорта.":"Import fehlgeschlagen.","Операция без описания":"Buchung ohne Beschreibung","Импорт…":"Import läuft…","Не удалось импортировать семейные операции.":"Familienbuchungen konnten nicht importiert werden.","Не удалось импортировать операции.":"Buchungen konnten nicht importiert werden.","За один раз можно импортировать не больше 500 операций. Сними галочки с лишних строк и повтори.":"Pro Import können höchstens 500 Buchungen verarbeitet werden. Wähle überzählige Zeilen ab und versuche es erneut.","В этой выписке несколько валют. Чтобы не исказить баланс, импортируй каждую валюту отдельным файлом.":"Dieser Kontoauszug enthält mehrere Währungen. Importiere jede Währung in einer eigenen Datei, damit der Kontostand korrekt bleibt.","Валюта выписки — ":"Währung des Kontoauszugs: ",", а валюта приложения — ":", während die App-Währung ",". Сначала измени валюту приложения в Настройках на ":". Ändere zuerst die App-Währung in den Einstellungen zu ",", затем загрузи выписку снова.":", und lade den Kontoauszug erneut hoch.","Напиши, например: «потратил 350 грн на продукты».":"Schreibe zum Beispiel: „350 UAH für Lebensmittel ausgegeben“.","Разбираю…":"Wird analysiert…","ИИ разбирает описание…":"KI analysiert die Beschreibung…","Не нашёл сумму. Укажи её в тексте, например «кофе 85 грн».":"Kein Betrag gefunden. Gib ihn im Text an, zum Beispiel „Kaffee 85 UAH“.","Проверь особенно внимательно: описание неоднозначно. ":"Bitte besonders sorgfältig prüfen: Die Beschreibung ist mehrdeutig. ","Черновик заполнен. ":"Entwurf ausgefüllt. ","Нажми «Сохранить» только после проверки.":"Klicke erst nach der Prüfung auf „Speichern“.","Проверь тип, сумму, описание и дату операции.":"Prüfe Art, Betrag, Beschreibung und Datum der Buchung.","Удалить эту семейную операцию?":"Diese Familienbuchung löschen?","Удалить эту операцию?":"Diese Buchung löschen?","Без конверта":"Ohne Umschlag","Изменить конверт":"Umschlag bearbeiten","Сохранить изменения":"Änderungen speichern","Новый конверт":"Neuer Umschlag","Создать":"Erstellen","Изменить копилку":"Sparziel bearbeiten","Новая банка":"Neues Sparkonto","Пополнить: ":"Einzahlen: ","Введи сумму больше нуля.":"Gib einen Betrag größer als null ein.","На доступном балансе недостаточно денег.":"Nicht genügend verfügbares Guthaben.","Сохранить":"Speichern","Открой приложение через Telegram.":"Öffne die App über Telegram.","Платёж получен. Проверяем активацию подписки.":"Zahlung erhalten. Abo-Aktivierung wird geprüft.","Оплата не прошла. Попробуй ещё раз.":"Zahlung fehlgeschlagen. Bitte versuche es erneut.","ИИ анализирует бюджет…":"KI analysiert dein Budget…","Открой приложение через Telegram, чтобы получать награды.":"Öffne die App über Telegram, um Belohnungen zu erhalten.","Обновляю баланс купонов…":"Gutscheinstand wird aktualisiert…","Не удалось обновить баланс. Попробуй ещё раз.":"Guthaben konnte nicht aktualisiert werden. Bitte versuche es erneut.","Выбери купон 10% или 20%.":"Wähle einen Gutschein mit 10 % oder 20 %.","Импорт выписки":"Kontoauszug importieren","CSV / Excel из любого банка":"CSV / Excel von jeder Bank"});
Object.assign(STATIC_UI_TRANSLATIONS.es, {"Найдено операций: ":"Operaciones encontradas: "," · Пропущено строк без даты/суммы: ":" · Filas omitidas (sin fecha/importe): "," · Показаны первые 2000 операций.":" · Se muestran las primeras 2.000 operaciones.","Ошибка импорта.":"Error de importación.","Операция без описания":"Operación sin descripción","Импорт…":"Importando…","Не удалось импортировать семейные операции.":"No se pudieron importar las operaciones familiares.","Не удалось импортировать операции.":"No se pudieron importar las operaciones.","За один раз можно импортировать не больше 500 операций. Сними галочки с лишних строк и повтори.":"Puedes importar hasta 500 operaciones a la vez. Desmarca las filas sobrantes e inténtalo de nuevo.","В этой выписке несколько валют. Чтобы не исказить баланс, импортируй каждую валюту отдельным файлом.":"Este extracto contiene varias monedas. Para evitar alterar el saldo, importa cada moneda en un archivo separado.","Валюта выписки — ":"Moneda del extracto: ",", а валюта приложения — ":", mientras que la moneda de la aplicación es ",". Сначала измени валюту приложения в Настройках на ":". Primero cambia la moneda de la aplicación en Ajustes a ",", затем загрузи выписку снова.":", y vuelve a cargar el extracto.","Напиши, например: «потратил 350 грн на продукты».":"Escribe, por ejemplo: «gasté 350 UAH en comida».","Разбираю…":"Analizando…","ИИ разбирает описание…":"La IA está analizando la descripción…","Не нашёл сумму. Укажи её в тексте, например «кофе 85 грн».":"No se encontró el importe. Indícalo en el texto, por ejemplo «café 85 UAH».","Проверь особенно внимательно: описание неоднозначно. ":"Revísalo con especial atención: la descripción es ambigua. ","Черновик заполнен. ":"Borrador completado. ","Нажми «Сохранить» только после проверки.":"Pulsa «Guardar» solo después de revisarlo.","Проверь тип, сумму, описание и дату операции.":"Revisa el tipo, el importe, la descripción y la fecha de la operación.","Удалить эту семейную операцию?":"¿Eliminar esta operación familiar?","Удалить эту операцию?":"¿Eliminar esta operación?","Без конверта":"Sin sobre","Изменить конверт":"Editar sobre","Сохранить изменения":"Guardar cambios","Новый конверт":"Nuevo sobre","Создать":"Crear","Изменить копилку":"Editar objetivo de ahorro","Новая банка":"Nueva hucha","Пополнить: ":"Añadir fondos: ","Введи сумму больше нуля.":"Introduce un importe mayor que cero.","На доступном балансе недостаточно денег.":"Saldo disponible insuficiente.","Сохранить":"Guardar","Открой приложение через Telegram.":"Abre la aplicación desde Telegram.","Платёж получен. Проверяем активацию подписки.":"Pago recibido. Comprobando la activación de la suscripción.","Оплата не прошла. Попробуй ещё раз.":"El pago ha fallado. Inténtalo de nuevo.","ИИ анализирует бюджет…":"La IA está analizando tu presupuesto…","Открой приложение через Telegram, чтобы получать награды.":"Abre la aplicación desde Telegram para recibir recompensas.","Обновляю баланс купонов…":"Actualizando el saldo de cupones…","Не удалось обновить баланс. Попробуй ещё раз.":"No se pudo actualizar el saldo. Inténtalo de nuevo.","Выбери купон 10% или 20%.":"Elige un cupón del 10 % o del 20 %.","Импорт выписки":"Importar extracto","CSV / Excel из любого банка":"CSV / Excel de cualquier banco"});
Object.assign(STATIC_UI_TRANSLATIONS.fr, {"Найдено операций: ":"Opérations trouvées : "," · Пропущено строк без даты/суммы: ":" · Lignes ignorées (date/montant manquant) : "," · Показаны первые 2000 операций.":" · Les 2 000 premières opérations sont affichées.","Ошибка импорта.":"Échec de l’importation.","Операция без описания":"Opération sans description","Импорт…":"Importation…","Не удалось импортировать семейные операции.":"Impossible d’importer les opérations familiales.","Не удалось импортировать операции.":"Impossible d’importer les opérations.","За один раз можно импортировать не больше 500 операций. Сними галочки с лишних строк и повтори.":"Tu peux importer jusqu’à 500 opérations à la fois. Décoche les lignes en trop et réessaie.","В этой выписке несколько валют. Чтобы не исказить баланс, импортируй каждую валюту отдельным файлом.":"Ce relevé contient plusieurs devises. Pour ne pas fausser le solde, importe chaque devise dans un fichier distinct.","Валюта выписки — ":"Devise du relevé : ",", а валюта приложения — ":", alors que la devise de l’application est ",". Сначала измени валюту приложения в Настройках на ":". Modifie d’abord la devise de l’application dans les Paramètres en ",", затем загрузи выписку снова.":", puis importe à nouveau le relevé.","Напиши, например: «потратил 350 грн на продукты».":"Écris par exemple : « dépensé 350 UAH en courses ».","Разбираю…":"Analyse…","ИИ разбирает описание…":"L’IA analyse la description…","Не нашёл сумму. Укажи её в тексте, например «кофе 85 грн».":"Aucun montant trouvé. Indique-le dans le texte, par exemple « café 85 UAH ».","Проверь особенно внимательно: описание неоднозначно. ":"Vérifie attentivement : la description est ambiguë. ","Черновик заполнен. ":"Brouillon rempli. ","Нажми «Сохранить» только после проверки.":"Clique sur « Enregistrer » uniquement après vérification.","Проверь тип, сумму, описание и дату операции.":"Vérifie le type, le montant, la description et la date de l’opération.","Удалить эту семейную операцию?":"Supprimer cette opération familiale ?","Удалить эту операцию?":"Supprimer cette opération ?","Без конверта":"Sans enveloppe","Изменить конверт":"Modifier l’enveloppe","Сохранить изменения":"Enregistrer les modifications","Новый конверт":"Nouvelle enveloppe","Создать":"Créer","Изменить копилку":"Modifier l’objectif d’épargne","Новая банка":"Nouvelle tirelire","Пополнить: ":"Ajouter des fonds : ","Введи сумму больше нуля.":"Saisis un montant supérieur à zéro.","На доступном балансе недостаточно денег.":"Solde disponible insuffisant.","Сохранить":"Enregistrer","Открой приложение через Telegram.":"Ouvre l’application via Telegram.","Платёж получен. Проверяем активацию подписки.":"Paiement reçu. Vérification de l’activation de l’abonnement.","Оплата не прошла. Попробуй ещё раз.":"Le paiement a échoué. Réessaie.","ИИ анализирует бюджет…":"L’IA analyse ton budget…","Открой приложение через Telegram, чтобы получать награды.":"Ouvre l’application via Telegram pour recevoir les récompenses.","Обновляю баланс купонов…":"Mise à jour du solde des coupons…","Не удалось обновить баланс. Попробуй ещё раз.":"Impossible de mettre à jour le solde. Réessaie.","Выбери купон 10% или 20%.":"Choisis un coupon de 10 % ou 20 %.","Импорт выписки":"Importer un relevé","CSV / Excel из любого банка":"CSV / Excel de n’importe quelle banque"});
Object.assign(STATIC_UI_TRANSLATIONS.it, {"Найдено операций: ":"Operazioni trovate: "," · Пропущено строк без даты/суммы: ":" · Righe ignorate (data/importo mancante): "," · Показаны первые 2000 операций.":" · Sono mostrate le prime 2.000 operazioni.","Ошибка импорта.":"Importazione non riuscita.","Операция без описания":"Operazione senza descrizione","Импорт…":"Importazione…","Не удалось импортировать семейные операции.":"Impossibile importare le operazioni familiari.","Не удалось импортировать операции.":"Impossibile importare le operazioni.","За один раз можно импортировать не больше 500 операций. Сними галочки с лишних строк и повтори.":"Puoi importare al massimo 500 operazioni alla volta. Deseleziona le righe in eccesso e riprova.","В этой выписке несколько валют. Чтобы не исказить баланс, импортируй каждую валюту отдельным файлом.":"Questo estratto contiene più valute. Per non alterare il saldo, importa ogni valuta in un file separato.","Валюта выписки — ":"Valuta dell’estratto: ",", а валюта приложения — ":", mentre la valuta dell’app è ",". Сначала измени валюту приложения в Настройках на ":". Prima cambia la valuta dell’app nelle Impostazioni in ",", затем загрузи выписку снова.":", quindi carica di nuovo l’estratto.","Напиши, например: «потратил 350 грн на продукты».":"Scrivi, ad esempio: «speso 350 UAH per la spesa».","Разбираю…":"Analisi…","ИИ разбирает описание…":"L’IA sta analizzando la descrizione…","Не нашёл сумму. Укажи её в тексте, например «кофе 85 грн».":"Importo non trovato. Indicalo nel testo, ad esempio «caffè 85 UAH».","Проверь особенно внимательно: описание неоднозначно. ":"Controlla con particolare attenzione: la descrizione è ambigua. ","Черновик заполнен. ":"Bozza compilata. ","Нажми «Сохранить» только после проверки.":"Premi «Salva» solo dopo aver controllato.","Проверь тип, сумму, описание и дату операции.":"Controlla tipo, importo, descrizione e data dell’operazione.","Удалить эту семейную операцию?":"Eliminare questa operazione familiare?","Удалить эту операцию?":"Eliminare questa operazione?","Без конверта":"Senza busta","Изменить конверт":"Modifica busta","Сохранить изменения":"Salva modifiche","Новый конверт":"Nuova busta","Создать":"Crea","Изменить копилку":"Modifica obiettivo di risparmio","Новая банка":"Nuovo salvadanaio","Пополнить: ":"Aggiungi fondi: ","Введи сумму больше нуля.":"Inserisci un importo maggiore di zero.","На доступном балансе недостаточно денег.":"Saldo disponibile insufficiente.","Сохранить":"Salva","Открой приложение через Telegram.":"Apri l’app tramite Telegram.","Платёж получен. Проверяем активацию подписки.":"Pagamento ricevuto. Verifica dell’attivazione dell’abbonamento.","Оплата не прошла. Попробуй ещё раз.":"Pagamento non riuscito. Riprova.","ИИ анализирует бюджет…":"L’IA sta analizzando il tuo budget…","Открой приложение через Telegram, чтобы получать награды.":"Apri l’app tramite Telegram per ricevere i premi.","Обновляю баланс купонов…":"Aggiornamento del saldo dei coupon…","Не удалось обновить баланс. Попробуй ещё раз.":"Impossibile aggiornare il saldo. Riprova.","Выбери купон 10% или 20%.":"Scegli un coupon del 10% o del 20%.","Импорт выписки":"Importa estratto conto","CSV / Excel из любого банка":"CSV / Excel da qualsiasi banca"});
Object.assign(STATIC_UI_TRANSLATIONS.pl, {"Найдено операций: ":"Znalezione transakcje: "," · Пропущено строк без даты/суммы: ":" · Pominięte wiersze (brak daty/kwoty): "," · Показаны первые 2000 операций.":" · Wyświetlono pierwsze 2 000 transakcji.","Ошибка импорта.":"Import zakończony błędem.","Операция без описания":"Transakcja bez opisu","Импорт…":"Importowanie…","Не удалось импортировать семейные операции.":"Nie udało się zaimportować transakcji rodzinnych.","Не удалось импортировать операции.":"Nie udało się zaimportować transakcji.","За один раз можно импортировать не больше 500 операций. Сними галочки с лишних строк и повтори.":"Jednorazowo można zaimportować maksymalnie 500 transakcji. Odznacz zbędne wiersze i spróbuj ponownie.","В этой выписке несколько валют. Чтобы не исказить баланс, импортируй каждую валюту отдельным файлом.":"Ten wyciąg zawiera kilka walut. Aby nie zniekształcić salda, importuj każdą walutę z osobnego pliku.","Валюта выписки — ":"Waluta wyciągu: ",", а валюта приложения — ":", a waluta aplikacji to ",". Сначала измени валюту приложения в Настройках на ":". Najpierw zmień walutę aplikacji w Ustawieniach na ",", затем загрузи выписку снова.":", a następnie ponownie prześlij wyciąg.","Напиши, например: «потратил 350 грн на продукты».":"Napisz na przykład: „wydano 350 UAH na zakupy spożywcze”.","Разбираю…":"Analizowanie…","ИИ разбирает описание…":"AI analizuje opis…","Не нашёл сумму. Укажи её в тексте, например «кофе 85 грн».":"Nie znaleziono kwoty. Podaj ją w tekście, np. „kawa 85 UAH”.","Проверь особенно внимательно: описание неоднозначно. ":"Sprawdź dokładnie: opis jest niejednoznaczny. ","Черновик заполнен. ":"Wersja robocza uzupełniona. ","Нажми «Сохранить» только после проверки.":"Kliknij „Zapisz” dopiero po sprawdzeniu.","Проверь тип, сумму, описание и дату операции.":"Sprawdź typ, kwotę, opis i datę transakcji.","Удалить эту семейную операцию?":"Usunąć tę transakcję rodzinną?","Удалить эту операцию?":"Usunąć tę transakcję?","Без конверта":"Bez koperty","Изменить конверт":"Edytuj kopertę","Сохранить изменения":"Zapisz zmiany","Новый конверт":"Nowa koperta","Создать":"Utwórz","Изменить копилку":"Edytuj cel oszczędnościowy","Новая банка":"Nowa skarbonka","Пополнить: ":"Wpłać: ","Введи сумму больше нуля.":"Wpisz kwotę większą od zera.","На доступном балансе недостаточно денег.":"Niewystarczające dostępne saldo.","Сохранить":"Zapisz","Открой приложение через Telegram.":"Otwórz aplikację przez Telegram.","Платёж получен. Проверяем активацию подписки.":"Płatność otrzymana. Sprawdzanie aktywacji subskrypcji.","Оплата не прошла. Попробуй ещё раз.":"Płatność nie powiodła się. Spróbuj ponownie.","ИИ анализирует бюджет…":"AI analizuje Twój budżet…","Открой приложение через Telegram, чтобы получать награды.":"Otwórz aplikację przez Telegram, aby odbierać nagrody.","Обновляю баланс купонов…":"Aktualizowanie salda kuponów…","Не удалось обновить баланс. Попробуй ещё раз.":"Nie udało się odświeżyć salda. Spróbuj ponownie.","Выбери купон 10% или 20%.":"Wybierz kupon 10% lub 20%.","Импорт выписки":"Importuj wyciąg","CSV / Excel из любого банка":"CSV / Excel z dowolnego banku"});
Object.assign(STATIC_UI_TRANSLATIONS.tr, {"Найдено операций: ":"Bulunan işlem: "," · Пропущено строк без даты/суммы: ":" · Tarih/tutar eksik olduğu için atlanan satır: "," · Показаны первые 2000 операций.":" · İlk 2.000 işlem gösteriliyor.","Ошибка импорта.":"İçe aktarma başarısız.","Операция без описания":"Açıklamasız işlem","Импорт…":"İçe aktarılıyor…","Не удалось импортировать семейные операции.":"Aile işlemleri içe aktarılamadı.","Не удалось импортировать операции.":"İşlemler içe aktarılamadı.","За один раз можно импортировать не больше 500 операций. Сними галочки с лишних строк и повтори.":"Tek seferde en fazla 500 işlem içe aktarabilirsin. Fazla satırların seçimini kaldırıp tekrar dene.","В этой выписке несколько валют. Чтобы не исказить баланс, импортируй каждую валюту отдельным файлом.":"Bu ekstrede birden fazla para birimi var. Bakiyenin yanlış hesaplanmaması için her para birimini ayrı dosyadan içe aktar.","Валюта выписки — ":"Ekstre para birimi: ",", а валюта приложения — ":", uygulama para birimi ise ",". Сначала измени валюту приложения в Настройках на ":". Önce Ayarlar bölümünden uygulama para birimini ",", затем загрузи выписку снова.":", ardından ekstreyi tekrar yükle.","Напиши, например: «потратил 350 грн на продукты».":"Örneğin şöyle yaz: “market için 350 UAH harcadım”.","Разбираю…":"Çözümleniyor…","ИИ разбирает описание…":"Yapay zekâ açıklamayı çözümlüyor…","Не нашёл сумму. Укажи её в тексте, например «кофе 85 грн».":"Tutar bulunamadı. Metne örneğin “kahve 85 UAH” yaz.","Проверь особенно внимательно: описание неоднозначно. ":"Dikkatlice kontrol et: açıklama belirsiz. ","Черновик заполнен. ":"Taslak dolduruldu. ","Нажми «Сохранить» только после проверки.":"Yalnızca kontrol ettikten sonra “Kaydet”e bas.","Проверь тип, сумму, описание и дату операции.":"İşlem türünü, tutarı, açıklamayı ve tarihi kontrol et.","Удалить эту семейную операцию?":"Bu aile işlemi silinsin mi?","Удалить эту операцию?":"Bu işlem silinsin mi?","Без конверта":"Zarf yok","Изменить конверт":"Zarfı düzenle","Сохранить изменения":"Değişiklikleri kaydet","Новый конверт":"Yeni zarf","Создать":"Oluştur","Изменить копилку":"Birikim hedefini düzenle","Новая банка":"Yeni birikim hesabı","Пополнить: ":"Para ekle: ","Введи сумму больше нуля.":"Sıfırdan büyük bir tutar gir.","На доступном балансе недостаточно денег.":"Kullanılabilir bakiye yetersiz.","Сохранить":"Kaydet","Открой приложение через Telegram.":"Uygulamayı Telegram üzerinden aç.","Платёж получен. Проверяем активацию подписки.":"Ödeme alındı. Abonelik etkinleştirmesi kontrol ediliyor.","Оплата не прошла. Попробуй ещё раз.":"Ödeme başarısız oldu. Tekrar dene.","ИИ анализирует бюджет…":"Yapay zekâ bütçeni analiz ediyor…","Открой приложение через Telegram, чтобы получать награды.":"Ödülleri almak için uygulamayı Telegram üzerinden aç.","Обновляю баланс купонов…":"Kupon bakiyesi yenileniyor…","Не удалось обновить баланс. Попробуй ещё раз.":"Bakiye yenilenemedi. Tekrar dene.","Выбери купон 10% или 20%.":"%10 veya %20 kupon seç.","Импорт выписки":"Ekstreyi içe aktar","CSV / Excel из любого банка":"Herhangi bir bankadan CSV / Excel"});
Object.assign(STATIC_UI_TRANSLATIONS.zh, {"Найдено операций: ":"找到的交易："," · Пропущено строк без даты/суммы: ":" · 已跳过的行（缺少日期/金额）："," · Показаны первые 2000 операций.":" · 仅显示前 2,000 笔交易。","Ошибка импорта.":"导入失败。","Операция без описания":"无描述的交易","Импорт…":"正在导入…","Не удалось импортировать семейные операции.":"无法导入家庭交易。","Не удалось импортировать операции.":"无法导入交易。","За один раз можно импортировать не больше 500 операций. Сними галочки с лишних строк и повтори.":"一次最多可导入 500 笔交易。取消勾选多余行后重试。","В этой выписке несколько валют. Чтобы не исказить баланс, импортируй каждую валюту отдельным файлом.":"此账单包含多种货币。为避免余额错误，请将每种货币分别导入。","Валюта выписки — ":"账单币种：",", а валюта приложения — ":",而应用币种为",". Сначала измени валюту приложения в Настройках на ":".请先在设置中将应用币种更改为",", затем загрузи выписку снова.":"，然后重新上传账单。","Напиши, например: «потратил 350 грн на продукты».":"例如：“买食品花了 350 UAH”。","Разбираю…":"正在解析…","ИИ разбирает описание…":"AI 正在解析描述…","Не нашёл сумму. Укажи её в тексте, например «кофе 85 грн».":"未找到金额。请在文字中注明，例如“咖啡 85 UAH”。","Проверь особенно внимательно: описание неоднозначно. ":"请仔细检查：描述存在歧义。","Черновик заполнен. ":"草稿已填写。","Нажми «Сохранить» только после проверки.":"检查无误后再点击“保存”。","Проверь тип, сумму, описание и дату операции.":"请检查交易类型、金额、描述和日期。","Удалить эту семейную операцию?":"删除这笔家庭交易？","Удалить эту операцию?":"删除这笔交易？","Без конверта":"无信封","Изменить конверт":"编辑信封","Сохранить изменения":"保存更改","Новый конверт":"新建信封","Создать":"创建","Изменить копилку":"编辑储蓄目标","Новая банка":"新建储蓄罐","Пополнить: ":"存入：","Введи сумму больше нуля.":"请输入大于零的金额。","На доступном балансе недостаточно денег.":"可用余额不足。","Сохранить":"保存","Открой приложение через Telegram.":"请通过 Telegram 打开应用。","Платёж получен. Проверяем активацию подписки.":"已收到付款。正在检查订阅是否激活。","Оплата не прошла. Попробуй ещё раз.":"付款失败。请重试。","ИИ анализирует бюджет…":"AI 正在分析你的预算…","Открой приложение через Telegram, чтобы получать награды.":"请通过 Telegram 打开应用以领取奖励。","Обновляю баланс купонов…":"正在刷新优惠券余额…","Не удалось обновить баланс. Попробуй ещё раз.":"无法更新余额。请重试。","Выбери купон 10% или 20%.":"请选择 10% 或 20% 优惠券。","Импорт выписки":"导入账单","CSV / Excel из любого банка":"支持任意银行的 CSV / Excel 文件"});
Object.assign(STATIC_UI_TRANSLATIONS.zh, {"Работает внутри Telegram — не нужно устанавливать отдельное приложение.":"在 Telegram 内使用，无需安装独立应用。"});
Object.assign(STATIC_UI_TRANSLATIONS.ru, {"Открой приложение через Telegram, чтобы получить ссылку":"Открой приложение через Telegram, чтобы получить ссылку","Реферальная ссылка скопирована!":"Реферальная ссылка скопирована!","Не удалось скопировать автоматически. Выдели ссылку и скопируй её вручную.":"Не удалось скопировать автоматически. Выдели ссылку и скопируй её вручную.","Не удалось загрузить семейную группу.":"Не удалось загрузить семейную группу.","Не удалось сохранить семейную операцию.":"Не удалось сохранить семейную операцию.","Не удалось сохранить операцию.":"Не удалось сохранить операцию.","Не удалось удалить конверт.":"Не удалось удалить конверт.","Не удалось создать семейный конверт.":"Не удалось создать семейный конверт.","Укажи название и цель больше нуля.":"Укажи название и цель больше нуля.","Не удалось удалить копилку.":"Не удалось удалить копилку.","Не удалось сохранить копилку.":"Не удалось сохранить копилку.","Доступно на семейном балансе: ":"Доступно на семейном балансе: ","Доступно на личном балансе: ":"Доступно на личном балансе: ","Не удалось пополнить копилку.":"Не удалось пополнить копилку.","🎉 Цель достигнута!\n\nКопилка «":"🎉 Цель достигнута!\n\nКопилка «","Расширенная аналитика PRO":"Расширенная аналитика PRO","Сравнение с прошлым месяцем, топ категорий, средние дневные траты и прогноз до конца месяца.":"Сравнение с прошлым месяцем, топ категорий, средние дневные траты и прогноз до конца месяца.","Привет! Я помогу разобраться с расходами, найти возможности для экономии и оценить бюджет. Задай вопрос ниже.":"Привет! Я помогу разобраться с расходами, найти возможности для экономии и оценить бюджет. Задай вопрос ниже.","Не удалось загрузить награды.":"Не удалось загрузить награды.","Награда за сегодня уже получена.":"Награда за сегодня уже получена.","Ошибка получения награды.":"Ошибка получения награды.","Открой приложение через Telegram, чтобы купить купон.":"Открой приложение через Telegram, чтобы купить купон.","Создаю счёт Crypto Pay на ":"Создаю счёт Crypto Pay на ","Счёт создан на ":"Счёт создан на ","Не удалось создать счёт. Попробуй ещё раз.":"Не удалось создать счёт. Попробуй ещё раз.","Купон −":"Купон −","Пока нет доступных ИИ-запросов. Купи пакет ниже.":"Пока нет доступных ИИ-запросов. Купи пакет ниже.","Не удалось загрузить баланс ИИ-запросов.":"Не удалось загрузить баланс ИИ-запросов.","Открой Family Budget через Telegram для покупки.":"Открой Family Budget через Telegram для покупки.","Создаю счёт в USDT…":"Создаю счёт в USDT…","Счёт создан. После оплаты запросы автоматически появятся на балансе.":"Счёт создан. После оплаты запросы автоматически появятся на балансе.","Ошибка создания счёта.":"Ошибка создания счёта."});
Object.assign(STATIC_UI_TRANSLATIONS.en, {"Открой приложение через Telegram, чтобы получить ссылку":"Open the app through Telegram to get your link","Реферальная ссылка скопирована!":"Referral link copied!","Не удалось скопировать автоматически. Выдели ссылку и скопируй её вручную.":"Could not copy automatically. Select the link and copy it manually.","Не удалось загрузить семейную группу.":"Could not load the family group.","Не удалось сохранить семейную операцию.":"Could not save the family transaction.","Не удалось сохранить операцию.":"Could not save the transaction.","Не удалось удалить конверт.":"Could not delete the envelope.","Не удалось создать семейный конверт.":"Could not create the family envelope.","Укажи название и цель больше нуля.":"Enter a name and a target greater than zero.","Не удалось удалить копилку.":"Could not delete the savings goal.","Не удалось сохранить копилку.":"Could not save the savings goal.","Доступно на семейном балансе: ":"Available in family balance: ","Доступно на личном балансе: ":"Available in personal balance: ","Не удалось пополнить копилку.":"Could not add funds to the savings goal.","🎉 Цель достигнута!\n\nКопилка «":"🎉 Goal reached!\n\nSavings goal “","Расширенная аналитика PRO":"Advanced PRO analytics","Сравнение с прошлым месяцем, топ категорий, средние дневные траты и прогноз до конца месяца.":"Compare with last month, top categories, average daily spending, and forecast through month-end.","Привет! Я помогу разобраться с расходами, найти возможности для экономии и оценить бюджет. Задай вопрос ниже.":"Hi! I can help you understand your spending, find ways to save, and review your budget. Ask a question below.","Не удалось загрузить награды.":"Could not load rewards.","Награда за сегодня уже получена.":"Today's reward has already been claimed.","Ошибка получения награды.":"Could not claim the reward.","Открой приложение через Telegram, чтобы купить купон.":"Open the app through Telegram to buy a coupon.","Создаю счёт Crypto Pay на ":"Creating a Crypto Pay invoice for ","Счёт создан на ":"Invoice created for ","Не удалось создать счёт. Попробуй ещё раз.":"Could not create the invoice. Please try again.","Купон −":"Coupon −","Пока нет доступных ИИ-запросов. Купи пакет ниже.":"No AI requests available. Buy a pack below.","Не удалось загрузить баланс ИИ-запросов.":"Could not load AI request balance.","Открой Family Budget через Telegram для покупки.":"Open Family Budget through Telegram to make a purchase.","Создаю счёт в USDT…":"Creating USDT invoice…","Счёт создан. После оплаты запросы автоматически появятся на балансе.":"Invoice created. Requests will appear in your balance automatically after payment.","Ошибка создания счёта.":"Could not create the invoice."});
Object.assign(STATIC_UI_TRANSLATIONS.uk, {"Открой приложение через Telegram, чтобы получить ссылку":"Відкрий застосунок через Telegram, щоб отримати посилання","Реферальная ссылка скопирована!":"Реферальне посилання скопійовано!","Не удалось скопировать автоматически. Выдели ссылку и скопируй её вручную.":"Не вдалося скопіювати автоматично. Виділи посилання та скопіюй його вручну.","Не удалось загрузить семейную группу.":"Не вдалося завантажити сімейну групу.","Не удалось сохранить семейную операцию.":"Не вдалося зберегти сімейну операцію.","Не удалось сохранить операцию.":"Не вдалося зберегти операцію.","Не удалось удалить конверт.":"Не вдалося видалити конверт.","Не удалось создать семейный конверт.":"Не вдалося створити сімейний конверт.","Укажи название и цель больше нуля.":"Вкажи назву та ціль, більшу за нуль.","Не удалось удалить копилку.":"Не вдалося видалити скарбничку.","Не удалось сохранить копилку.":"Не вдалося зберегти скарбничку.","Доступно на семейном балансе: ":"Доступно на сімейному балансі: ","Доступно на личном балансе: ":"Доступно на особистому балансі: ","Не удалось пополнить копилку.":"Не вдалося поповнити скарбничку.","🎉 Цель достигнута!\n\nКопилка «":"🎉 Цілі досягнуто!\n\nСкарбничка «","Расширенная аналитика PRO":"Розширена аналітика PRO","Сравнение с прошлым месяцем, топ категорий, средние дневные траты и прогноз до конца месяца.":"Порівняння з минулим місяцем, топ категорій, середні щоденні витрати та прогноз до кінця місяця.","Привет! Я помогу разобраться с расходами, найти возможности для экономии и оценить бюджет. Задай вопрос ниже.":"Привіт! Я допоможу розібратися з витратами, знайти можливості заощадити й оцінити бюджет. Постав запитання нижче.","Не удалось загрузить награды.":"Не вдалося завантажити нагороди.","Награда за сегодня уже получена.":"Сьогоднішню нагороду вже отримано.","Ошибка получения награды.":"Не вдалося отримати нагороду.","Открой приложение через Telegram, чтобы купить купон.":"Відкрий застосунок через Telegram, щоб придбати купон.","Создаю счёт Crypto Pay на ":"Створюю рахунок Crypto Pay на ","Счёт создан на ":"Рахунок створено на ","Не удалось создать счёт. Попробуй ещё раз.":"Не вдалося створити рахунок. Спробуй ще раз.","Купон −":"Купон −","Пока нет доступных ИИ-запросов. Купи пакет ниже.":"Поки немає доступних ШІ-запитів. Придбай пакет нижче.","Не удалось загрузить баланс ИИ-запросов.":"Не вдалося завантажити баланс ШІ-запитів.","Открой Family Budget через Telegram для покупки.":"Відкрий Family Budget через Telegram, щоб здійснити покупку.","Создаю счёт в USDT…":"Створюю рахунок у USDT…","Счёт создан. После оплаты запросы автоматически появятся на балансе.":"Рахунок створено. Після оплати запити автоматично з’являться на балансі.","Ошибка создания счёта.":"Помилка створення рахунку."});
Object.assign(STATIC_UI_TRANSLATIONS.de, {"Открой приложение через Telegram, чтобы получить ссылку":"Öffne die App über Telegram, um deinen Link zu erhalten","Реферальная ссылка скопирована!":"Empfehlungslink kopiert!","Не удалось скопировать автоматически. Выдели ссылку и скопируй её вручную.":"Automatisches Kopieren fehlgeschlagen. Markiere den Link und kopiere ihn manuell.","Не удалось загрузить семейную группу.":"Familiengruppe konnte nicht geladen werden.","Не удалось сохранить семейную операцию.":"Familienbuchung konnte nicht gespeichert werden.","Не удалось сохранить операцию.":"Buchung konnte nicht gespeichert werden.","Не удалось удалить конверт.":"Umschlag konnte nicht gelöscht werden.","Не удалось создать семейный конверт.":"Familienumschlag konnte nicht erstellt werden.","Укажи название и цель больше нуля.":"Gib einen Namen und ein Ziel größer als null ein.","Не удалось удалить копилку.":"Sparziel konnte nicht gelöscht werden.","Не удалось сохранить копилку.":"Sparziel konnte nicht gespeichert werden.","Доступно на семейном балансе: ":"Im Familienguthaben verfügbar: ","Доступно на личном балансе: ":"Im persönlichen Guthaben verfügbar: ","Не удалось пополнить копилку.":"Sparziel konnte nicht aufgeladen werden.","🎉 Цель достигнута!\n\nКопилка «":"🎉 Ziel erreicht!\n\nSparziel „","Расширенная аналитика PRO":"Erweiterte PRO-Analysen","Сравнение с прошлым месяцем, топ категорий, средние дневные траты и прогноз до конца месяца.":"Vergleich mit dem Vormonat, Top-Kategorien, durchschnittliche Tagesausgaben und Prognose bis Monatsende.","Привет! Я помогу разобраться с расходами, найти возможности для экономии и оценить бюджет. Задай вопрос ниже.":"Hallo! Ich helfe dir, deine Ausgaben zu verstehen, Sparmöglichkeiten zu finden und dein Budget einzuschätzen. Stelle unten eine Frage.","Не удалось загрузить награды.":"Belohnungen konnten nicht geladen werden.","Награда за сегодня уже получена.":"Die heutige Belohnung wurde bereits abgeholt.","Ошибка получения награды.":"Belohnung konnte nicht abgeholt werden.","Открой приложение через Telegram, чтобы купить купон.":"Öffne die App über Telegram, um einen Gutschein zu kaufen.","Создаю счёт Crypto Pay на ":"Crypto-Pay-Rechnung über ","Счёт создан на ":"Rechnung erstellt über ","Не удалось создать счёт. Попробуй ещё раз.":"Rechnung konnte nicht erstellt werden. Bitte versuche es erneut.","Купон −":"Gutschein −","Пока нет доступных ИИ-запросов. Купи пакет ниже.":"Derzeit keine KI-Anfragen verfügbar. Kaufe unten ein Paket.","Не удалось загрузить баланс ИИ-запросов.":"KI-Anfragekontingent konnte nicht geladen werden.","Открой Family Budget через Telegram для покупки.":"Öffne Family Budget über Telegram, um einen Kauf zu tätigen.","Создаю счёт в USDT…":"USDT-Rechnung wird erstellt…","Счёт создан. После оплаты запросы автоматически появятся на балансе.":"Rechnung erstellt. Nach der Zahlung werden die Anfragen automatisch deinem Guthaben gutgeschrieben.","Ошибка создания счёта.":"Fehler beim Erstellen der Rechnung."});
Object.assign(STATIC_UI_TRANSLATIONS.es, {"Открой приложение через Telegram, чтобы получить ссылку":"Abre la aplicación desde Telegram para obtener tu enlace","Реферальная ссылка скопирована!":"¡Enlace de recomendación copiado!","Не удалось скопировать автоматически. Выдели ссылку и скопируй её вручную.":"No se pudo copiar automáticamente. Selecciona el enlace y cópialo manualmente.","Не удалось загрузить семейную группу.":"No se pudo cargar el grupo familiar.","Не удалось сохранить семейную операцию.":"No se pudo guardar la operación familiar.","Не удалось сохранить операцию.":"No se pudo guardar la operación.","Не удалось удалить конверт.":"No se pudo eliminar el sobre.","Не удалось создать семейный конверт.":"No se pudo crear el sobre familiar.","Укажи название и цель больше нуля.":"Indica un nombre y un objetivo mayor que cero.","Не удалось удалить копилку.":"No se pudo eliminar el objetivo de ahorro.","Не удалось сохранить копилку.":"No se pudo guardar el objetivo de ahorro.","Доступно на семейном балансе: ":"Disponible en el saldo familiar: ","Доступно на личном балансе: ":"Disponible en el saldo personal: ","Не удалось пополнить копилку.":"No se pudo añadir dinero al objetivo de ahorro.","🎉 Цель достигнута!\n\nКопилка «":"🎉 ¡Objetivo alcanzado!\n\nLa hucha «","Расширенная аналитика PRO":"Análisis avanzado PRO","Сравнение с прошлым месяцем, топ категорий, средние дневные траты и прогноз до конца месяца.":"Comparación con el mes anterior, categorías principales, gasto diario medio y previsión hasta fin de mes.","Привет! Я помогу разобраться с расходами, найти возможности для экономии и оценить бюджет. Задай вопрос ниже.":"¡Hola! Te ayudaré a entender tus gastos, encontrar formas de ahorrar y evaluar tu presupuesto. Haz una pregunta abajo.","Не удалось загрузить награды.":"No se pudieron cargar las recompensas.","Награда за сегодня уже получена.":"La recompensa de hoy ya se ha reclamado.","Ошибка получения награды.":"No se pudo reclamar la recompensa.","Открой приложение через Telegram, чтобы купить купон.":"Abre la aplicación desde Telegram para comprar un cupón.","Создаю счёт Crypto Pay на ":"Creando una factura de Crypto Pay por ","Счёт создан на ":"Factura creada por ","Не удалось создать счёт. Попробуй ещё раз.":"No se pudo crear la factura. Inténtalo de nuevo.","Купон −":"Cupón −","Пока нет доступных ИИ-запросов. Купи пакет ниже.":"No hay consultas de IA disponibles. Compra un paquete abajo.","Не удалось загрузить баланс ИИ-запросов.":"No se pudo cargar el saldo de consultas de IA.","Открой Family Budget через Telegram для покупки.":"Abre Family Budget desde Telegram para realizar una compra.","Создаю счёт в USDT…":"Creando factura en USDT…","Счёт создан. После оплаты запросы автоматически появятся на балансе.":"Factura creada. Tras el pago, las consultas aparecerán automáticamente en tu saldo.","Ошибка создания счёта.":"Error al crear la factura."});
Object.assign(STATIC_UI_TRANSLATIONS.fr, {"Открой приложение через Telegram, чтобы получить ссылку":"Ouvre l’application via Telegram pour obtenir ton lien","Реферальная ссылка скопирована!":"Lien de parrainage copié !","Не удалось скопировать автоматически. Выдели ссылку и скопируй её вручную.":"La copie automatique a échoué. Sélectionne le lien et copie-le manuellement.","Не удалось загрузить семейную группу.":"Impossible de charger le groupe familial.","Не удалось сохранить семейную операцию.":"Impossible d’enregistrer l’opération familiale.","Не удалось сохранить операцию.":"Impossible d’enregistrer l’opération.","Не удалось удалить конверт.":"Impossible de supprimer l’enveloppe.","Не удалось создать семейный конверт.":"Impossible de créer l’enveloppe familiale.","Укажи название и цель больше нуля.":"Indique un nom et un objectif supérieur à zéro.","Не удалось удалить копилку.":"Impossible de supprimer l’objectif d’épargne.","Не удалось сохранить копилку.":"Impossible d’enregistrer l’objectif d’épargne.","Доступно на семейном балансе: ":"Disponible sur le solde familial : ","Доступно на личном балансе: ":"Disponible sur le solde personnel : ","Не удалось пополнить копилку.":"Impossible d’ajouter des fonds à l’objectif d’épargne.","🎉 Цель достигнута!\n\nКопилка «":"🎉 Objectif atteint !\n\nL’objectif «","Расширенная аналитика PRO":"Analyses avancées PRO","Сравнение с прошлым месяцем, топ категорий, средние дневные траты и прогноз до конца месяца.":"Comparaison avec le mois précédent, principales catégories, dépenses quotidiennes moyennes et prévision jusqu’à la fin du mois.","Привет! Я помогу разобраться с расходами, найти возможности для экономии и оценить бюджет. Задай вопрос ниже.":"Bonjour ! Je peux t’aider à comprendre tes dépenses, trouver des économies et évaluer ton budget. Pose ta question ci-dessous.","Не удалось загрузить награды.":"Impossible de charger les récompenses.","Награда за сегодня уже получена.":"La récompense du jour a déjà été récupérée.","Ошибка получения награды.":"Impossible de récupérer la récompense.","Открой приложение через Telegram, чтобы купить купон.":"Ouvre l’application via Telegram pour acheter un coupon.","Создаю счёт Crypto Pay на ":"Création d’une facture Crypto Pay de ","Счёт создан на ":"Facture créée pour ","Не удалось создать счёт. Попробуй ещё раз.":"Impossible de créer la facture. Réessaie.","Купон −":"Coupon −","Пока нет доступных ИИ-запросов. Купи пакет ниже.":"Aucune requête IA disponible. Achète un pack ci-dessous.","Не удалось загрузить баланс ИИ-запросов.":"Impossible de charger le solde des requêtes IA.","Открой Family Budget через Telegram для покупки.":"Ouvre Family Budget via Telegram pour effectuer un achat.","Создаю счёт в USDT…":"Création de la facture en USDT…","Счёт создан. После оплаты запросы автоматически появятся на балансе.":"Facture créée. Après le paiement, les requêtes seront automatiquement ajoutées à ton solde.","Ошибка создания счёта.":"Erreur lors de la création de la facture."});
Object.assign(STATIC_UI_TRANSLATIONS.it, {"Открой приложение через Telegram, чтобы получить ссылку":"Apri l’app tramite Telegram per ottenere il tuo link","Реферальная ссылка скопирована!":"Link di invito copiato!","Не удалось скопировать автоматически. Выдели ссылку и скопируй её вручную.":"Impossibile copiare automaticamente. Seleziona il link e copialo manualmente.","Не удалось загрузить семейную группу.":"Impossibile caricare il gruppo familiare.","Не удалось сохранить семейную операцию.":"Impossibile salvare l’operazione familiare.","Не удалось сохранить операцию.":"Impossibile salvare l’operazione.","Не удалось удалить конверт.":"Impossibile eliminare la busta.","Не удалось создать семейный конверт.":"Impossibile creare la busta familiare.","Укажи название и цель больше нуля.":"Inserisci un nome e un obiettivo maggiore di zero.","Не удалось удалить копилку.":"Impossibile eliminare l’obiettivo di risparmio.","Не удалось сохранить копилку.":"Impossibile salvare l’obiettivo di risparmio.","Доступно на семейном балансе: ":"Disponibile nel saldo familiare: ","Доступно на личном балансе: ":"Disponibile nel saldo personale: ","Не удалось пополнить копилку.":"Impossibile aggiungere fondi all’obiettivo di risparmio.","🎉 Цель достигнута!\n\nКопилка «":"🎉 Obiettivo raggiunto!\n\nIl salvadanaio «","Расширенная аналитика PRO":"Analisi avanzate PRO","Сравнение с прошлым месяцем, топ категорий, средние дневные траты и прогноз до конца месяца.":"Confronto con il mese precedente, categorie principali, spesa media giornaliera e previsione fino a fine mese.","Привет! Я помогу разобраться с расходами, найти возможности для экономии и оценить бюджет. Задай вопрос ниже.":"Ciao! Ti aiuterò a capire le spese, trovare modi per risparmiare e valutare il budget. Fai una domanda qui sotto.","Не удалось загрузить награды.":"Impossibile caricare i premi.","Награда за сегодня уже получена.":"La ricompensa di oggi è già stata riscattata.","Ошибка получения награды.":"Impossibile riscattare il premio.","Открой приложение через Telegram, чтобы купить купон.":"Apri l’app tramite Telegram per acquistare un coupon.","Создаю счёт Crypto Pay на ":"Creazione di una fattura Crypto Pay di ","Счёт создан на ":"Fattura creata per ","Не удалось создать счёт. Попробуй ещё раз.":"Impossibile creare la fattura. Riprova.","Купон −":"Coupon −","Пока нет доступных ИИ-запросов. Купи пакет ниже.":"Nessuna richiesta IA disponibile. Acquista un pacchetto qui sotto.","Не удалось загрузить баланс ИИ-запросов.":"Impossibile caricare il saldo delle richieste IA.","Открой Family Budget через Telegram для покупки.":"Apri Family Budget tramite Telegram per effettuare un acquisto.","Создаю счёт в USDT…":"Creazione fattura in USDT…","Счёт создан. После оплаты запросы автоматически появятся на балансе.":"Fattura creata. Dopo il pagamento, le richieste appariranno automaticamente nel saldo.","Ошибка создания счёта.":"Errore durante la creazione della fattura."});
Object.assign(STATIC_UI_TRANSLATIONS.pl, {"Открой приложение через Telegram, чтобы получить ссылку":"Otwórz aplikację przez Telegram, aby uzyskać link","Реферальная ссылка скопирована!":"Link polecający skopiowany!","Не удалось скопировать автоматически. Выдели ссылку и скопируй её вручную.":"Nie udało się skopiować automatycznie. Zaznacz link i skopiuj go ręcznie.","Не удалось загрузить семейную группу.":"Nie udało się wczytać grupy rodzinnej.","Не удалось сохранить семейную операцию.":"Nie udało się zapisać transakcji rodzinnej.","Не удалось сохранить операцию.":"Nie udało się zapisać transakcji.","Не удалось удалить конверт.":"Nie udało się usunąć koperty.","Не удалось создать семейный конверт.":"Nie udało się utworzyć koperty rodzinnej.","Укажи название и цель больше нуля.":"Podaj nazwę i cel większy od zera.","Не удалось удалить копилку.":"Nie udało się usunąć celu oszczędnościowego.","Не удалось сохранить копилку.":"Nie udało się zapisać celu oszczędnościowego.","Доступно на семейном балансе: ":"Dostępne na saldzie rodzinnym: ","Доступно на личном балансе: ":"Dostępne na saldzie osobistym: ","Не удалось пополнить копилку.":"Nie udało się zasilić celu oszczędnościowego.","🎉 Цель достигнута!\n\nКопилка «":"🎉 Cel osiągnięty!\n\nCel oszczędnościowy „","Расширенная аналитика PRO":"Zaawansowana analityka PRO","Сравнение с прошлым месяцем, топ категорий, средние дневные траты и прогноз до конца месяца.":"Porównanie z poprzednim miesiącem, najważniejsze kategorie, średnie dzienne wydatki i prognoza do końca miesiąca.","Привет! Я помогу разобраться с расходами, найти возможности для экономии и оценить бюджет. Задай вопрос ниже.":"Cześć! Pomogę Ci przeanalizować wydatki, znaleźć oszczędności i ocenić budżet. Zadaj pytanie poniżej.","Не удалось загрузить награды.":"Nie udało się wczytać nagród.","Награда за сегодня уже получена.":"Dzisiejsza nagroda została już odebrana.","Ошибка получения награды.":"Nie udało się odebrać nagrody.","Открой приложение через Telegram, чтобы купить купон.":"Otwórz aplikację przez Telegram, aby kupić kupon.","Создаю счёт Crypto Pay на ":"Tworzenie rachunku Crypto Pay na ","Счёт создан на ":"Utworzono rachunek na ","Не удалось создать счёт. Попробуй ещё раз.":"Nie udało się utworzyć rachunku. Spróbuj ponownie.","Купон −":"Kupon −","Пока нет доступных ИИ-запросов. Купи пакет ниже.":"Brak dostępnych zapytań AI. Kup pakiet poniżej.","Не удалось загрузить баланс ИИ-запросов.":"Nie udało się wczytać salda zapytań AI.","Открой Family Budget через Telegram для покупки.":"Otwórz Family Budget przez Telegram, aby dokonać zakupu.","Создаю счёт в USDT…":"Tworzenie rachunku w USDT…","Счёт создан. После оплаты запросы автоматически появятся на балансе.":"Rachunek utworzony. Po opłaceniu zapytania automatycznie pojawią się na saldzie.","Ошибка создания счёта.":"Błąd tworzenia rachunku."});
Object.assign(STATIC_UI_TRANSLATIONS.tr, {"Открой приложение через Telegram, чтобы получить ссылку":"Bağlantını almak için uygulamayı Telegram üzerinden aç","Реферальная ссылка скопирована!":"Davet bağlantısı kopyalandı!","Не удалось скопировать автоматически. Выдели ссылку и скопируй её вручную.":"Otomatik kopyalama başarısız. Bağlantıyı seçip elle kopyala.","Не удалось загрузить семейную группу.":"Aile grubu yüklenemedi.","Не удалось сохранить семейную операцию.":"Aile işlemi kaydedilemedi.","Не удалось сохранить операцию.":"İşlem kaydedilemedi.","Не удалось удалить конверт.":"Zarf silinemedi.","Не удалось создать семейный конверт.":"Aile zarfı oluşturulamadı.","Укажи название и цель больше нуля.":"Bir ad ve sıfırdan büyük bir hedef gir.","Не удалось удалить копилку.":"Birikim hedefi silinemedi.","Не удалось сохранить копилку.":"Birikim hedefi kaydedilemedi.","Доступно на семейном балансе: ":"Aile bakiyesinde kullanılabilir: ","Доступно на личном балансе: ":"Kişisel bakiyede kullanılabilir: ","Не удалось пополнить копилку.":"Birikim hedefine para eklenemedi.","🎉 Цель достигнута!\n\nКопилка «":"🎉 Hedefe ulaşıldı!\n\nBirikim hedefi “","Расширенная аналитика PRO":"Gelişmiş PRO analizleri","Сравнение с прошлым месяцем, топ категорий, средние дневные траты и прогноз до конца месяца.":"Geçen ayla karşılaştırma, öne çıkan kategoriler, günlük ortalama harcama ve ay sonuna kadar tahmin.","Привет! Я помогу разобраться с расходами, найти возможности для экономии и оценить бюджет. Задай вопрос ниже.":"Merhaba! Harcamalarını anlamana, tasarruf yolları bulmana ve bütçeni değerlendirmene yardımcı olabilirim. Aşağıya bir soru yaz.","Не удалось загрузить награды.":"Ödüller yüklenemedi.","Награда за сегодня уже получена.":"Bugünün ödülü zaten alındı.","Ошибка получения награды.":"Ödül alınamadı.","Открой приложение через Telegram, чтобы купить купон.":"Kupon satın almak için uygulamayı Telegram üzerinden aç.","Создаю счёт Crypto Pay на ":"Crypto Pay faturası oluşturuluyor: ","Счёт создан на ":"Fatura oluşturuldu: ","Не удалось создать счёт. Попробуй ещё раз.":"Fatura oluşturulamadı. Tekrar dene.","Купон −":"Kupon −","Пока нет доступных ИИ-запросов. Купи пакет ниже.":"Kullanılabilir yapay zekâ isteği yok. Aşağıdan paket satın al.","Не удалось загрузить баланс ИИ-запросов.":"Yapay zekâ istek bakiyesi yüklenemedi.","Открой Family Budget через Telegram для покупки.":"Satın almak için Family Budget'ı Telegram üzerinden aç.","Создаю счёт в USDT…":"USDT faturası oluşturuluyor…","Счёт создан. После оплаты запросы автоматически появятся на балансе.":"Fatura oluşturuldu. Ödeme sonrası istekler otomatik olarak bakiyene eklenecek.","Ошибка создания счёта.":"Fatura oluşturma hatası."});
Object.assign(STATIC_UI_TRANSLATIONS.zh, {"Открой приложение через Telegram, чтобы получить ссылку":"请通过 Telegram 打开应用以获取链接","Реферальная ссылка скопирована!":"推荐链接已复制！","Не удалось скопировать автоматически. Выдели ссылку и скопируй её вручную.":"无法自动复制。请选中链接并手动复制。","Не удалось загрузить семейную группу.":"无法加载家庭组。","Не удалось сохранить семейную операцию.":"无法保存家庭交易。","Не удалось сохранить операцию.":"无法保存交易。","Не удалось удалить конверт.":"无法删除信封。","Не удалось создать семейный конверт.":"无法创建家庭信封。","Укажи название и цель больше нуля.":"请输入名称和大于零的目标金额。","Не удалось удалить копилку.":"无法删除储蓄目标。","Не удалось сохранить копилку.":"无法保存储蓄目标。","Доступно на семейном балансе: ":"家庭余额可用：","Доступно на личном балансе: ":"个人余额可用：","Не удалось пополнить копилку.":"无法向储蓄目标存入资金。","🎉 Цель достигнута!\n\nКопилка «":"🎉 目标达成！\n\n储蓄目标“","Расширенная аналитика PRO":"PRO 高级分析","Сравнение с прошлым месяцем, топ категорий, средние дневные траты и прогноз до конца месяца.":"与上月对比、主要类别、日均支出以及月底前预测。","Привет! Я помогу разобраться с расходами, найти возможности для экономии и оценить бюджет. Задай вопрос ниже.":"你好！我可以帮你了解支出、寻找省钱方法并评估预算。请在下方提问。","Не удалось загрузить награды.":"无法加载奖励。","Награда за сегодня уже получена.":"今日奖励已领取。","Ошибка получения награды.":"无法领取奖励。","Открой приложение через Telegram, чтобы купить купон.":"请通过 Telegram 打开应用以购买优惠券。","Создаю счёт Crypto Pay на ":"正在创建 Crypto Pay 账单，金额：","Счёт создан на ":"账单已创建，金额：","Не удалось создать счёт. Попробуй ещё раз.":"无法创建账单。请重试。","Купон −":"优惠券 −","Пока нет доступных ИИ-запросов. Купи пакет ниже.":"暂无可用 AI 请求。请在下方购买请求包。","Не удалось загрузить баланс ИИ-запросов.":"无法加载 AI 请求余额。","Открой Family Budget через Telegram для покупки.":"请通过 Telegram 打开 Family Budget 进行购买。","Создаю счёт в USDT…":"正在创建 USDT 账单…","Счёт создан. После оплаты запросы автоматически появятся на балансе.":"账单已创建。付款后，请求次数将自动计入余额。","Ошибка создания счёта.":"创建账单时出错。"});
Object.assign(STATIC_UI_TRANSLATIONS.ru, {"Скидка 10% выбрана. Купон спишется после подтверждения оплаты.":"Скидка 10% выбрана. Купон спишется после подтверждения оплаты.","Скидка 20% выбрана. Купон спишется после подтверждения оплаты.":"Скидка 20% выбрана. Купон спишется после подтверждения оплаты.","Выбери доступный купон или продолжай без скидки. Купон списывается только после оплаты.":"Выбери доступный купон или продолжай без скидки. Купон списывается только после оплаты.","Ошибка оплаты: ":"Ошибка оплаты: "});
Object.assign(STATIC_UI_TRANSLATIONS.en, {"Скидка 10% выбрана. Купон спишется после подтверждения оплаты.":"10% discount selected. The coupon will be deducted after payment is confirmed.","Скидка 20% выбрана. Купон спишется после подтверждения оплаты.":"20% discount selected. The coupon will be deducted after payment is confirmed.","Выбери доступный купон или продолжай без скидки. Купон списывается только после оплаты.":"Choose an available coupon or continue without a discount. The coupon is deducted only after payment.","Ошибка оплаты: ":"Payment error: "});
Object.assign(STATIC_UI_TRANSLATIONS.uk, {"Скидка 10% выбрана. Купон спишется после подтверждения оплаты.":"Знижку 10% вибрано. Купон буде списано після підтвердження оплати.","Скидка 20% выбрана. Купон спишется после подтверждения оплаты.":"Знижку 20% вибрано. Купон буде списано після підтвердження оплати.","Выбери доступный купон или продолжай без скидки. Купон списывается только после оплаты.":"Обери доступний купон або продовжуй без знижки. Купон списується лише після оплати.","Ошибка оплаты: ":"Помилка оплати: "});
Object.assign(STATIC_UI_TRANSLATIONS.de, {"Скидка 10% выбрана. Купон спишется после подтверждения оплаты.":"10-%-Rabatt ausgewählt. Der Gutschein wird nach Zahlungsbestätigung eingelöst.","Скидка 20% выбрана. Купон спишется после подтверждения оплаты.":"20-%-Rabatt ausgewählt. Der Gutschein wird nach Zahlungsbestätigung eingelöst.","Выбери доступный купон или продолжай без скидки. Купон списывается только после оплаты.":"Wähle einen verfügbaren Gutschein oder fahre ohne Rabatt fort. Der Gutschein wird erst nach der Zahlung eingelöst.","Ошибка оплаты: ":"Zahlungsfehler: "});
Object.assign(STATIC_UI_TRANSLATIONS.es, {"Скидка 10% выбрана. Купон спишется после подтверждения оплаты.":"Descuento del 10 % seleccionado. El cupón se descontará tras confirmar el pago.","Скидка 20% выбрана. Купон спишется после подтверждения оплаты.":"Descuento del 20 % seleccionado. El cupón se descontará tras confirmar el pago.","Выбери доступный купон или продолжай без скидки. Купон списывается только после оплаты.":"Elige un cupón disponible o continúa sin descuento. El cupón solo se descuenta después del pago.","Ошибка оплаты: ":"Error de pago: "});
Object.assign(STATIC_UI_TRANSLATIONS.fr, {"Скидка 10% выбрана. Купон спишется после подтверждения оплаты.":"Réduction de 10 % sélectionnée. Le coupon sera déduit après confirmation du paiement.","Скидка 20% выбрана. Купон спишется после подтверждения оплаты.":"Réduction de 20 % sélectionnée. Le coupon sera déduit après confirmation du paiement.","Выбери доступный купон или продолжай без скидки. Купон списывается только после оплаты.":"Choisis un coupon disponible ou continue sans réduction. Le coupon n’est déduit qu’après le paiement.","Ошибка оплаты: ":"Erreur de paiement : "});
Object.assign(STATIC_UI_TRANSLATIONS.it, {"Скидка 10% выбрана. Купон спишется после подтверждения оплаты.":"Sconto del 10% selezionato. Il coupon sarà scalato dopo la conferma del pagamento.","Скидка 20% выбрана. Купон спишется после подтверждения оплаты.":"Sconto del 20% selezionato. Il coupon sarà scalato dopo la conferma del pagamento.","Выбери доступный купон или продолжай без скидки. Купон списывается только после оплаты.":"Scegli un coupon disponibile o continua senza sconto. Il coupon viene scalato solo dopo il pagamento.","Ошибка оплаты: ":"Errore di pagamento: "});
Object.assign(STATIC_UI_TRANSLATIONS.pl, {"Скидка 10% выбрана. Купон спишется после подтверждения оплаты.":"Wybrano rabat 10%. Kupon zostanie wykorzystany po potwierdzeniu płatności.","Скидка 20% выбрана. Купон спишется после подтверждения оплаты.":"Wybrano rabat 20%. Kupon zostanie wykorzystany po potwierdzeniu płatności.","Выбери доступный купон или продолжай без скидки. Купон списывается только после оплаты.":"Wybierz dostępny kupon lub kontynuuj bez rabatu. Kupon zostanie wykorzystany dopiero po płatności.","Ошибка оплаты: ":"Błąd płatności: "});
Object.assign(STATIC_UI_TRANSLATIONS.tr, {"Скидка 10% выбрана. Купон спишется после подтверждения оплаты.":"%10 indirim seçildi. Kupon, ödeme onaylandıktan sonra düşülecek.","Скидка 20% выбрана. Купон спишется после подтверждения оплаты.":"%20 indirim seçildi. Kupon, ödeme onaylandıktan sonra düşülecek.","Выбери доступный купон или продолжай без скидки. Купон списывается только после оплаты.":"Kullanılabilir bir kupon seç veya indirim olmadan devam et. Kupon yalnızca ödeme sonrası düşülür.","Ошибка оплаты: ":"Ödeme hatası: "});
Object.assign(STATIC_UI_TRANSLATIONS.zh, {"Скидка 10% выбрана. Купон спишется после подтверждения оплаты.":"已选择 10% 折扣。付款确认后将扣除优惠券。","Скидка 20% выбрана. Купон спишется после подтверждения оплаты.":"已选择 20% 折扣。付款确认后将扣除优惠券。","Выбери доступный купон или продолжай без скидки. Купон списывается только после оплаты.":"请选择可用优惠券，或不使用折扣继续。优惠券仅在付款后扣除。","Ошибка оплаты: ":"付款错误："});

Object.assign(STATIC_UI_TRANSLATIONS.ru, {"Загрузить":"Загрузить","Приглашай друзей, получай купоны и открывай награды сезона.":"Приглашай друзей, получай купоны и открывай награды сезона.","Твоя реферальная ссылка":"Твоя реферальная ссылка","Приглашено":"Приглашено","всего пользователей":"всего пользователей","Платные рефералы":"Платные рефералы","с оплатой подписки":"с оплатой подписки","Оборот за сезон":"Оборот за сезон","подтверждённые подписки":"подтверждённые подписки","доступно":"доступно","Создай новую группу или вступи в семью по коду приглашения.":"Создай новую группу или вступи в семью по коду приглашения."});
Object.assign(STATIC_UI_TRANSLATIONS.uk, {"Загрузить":"Завантажити","Приглашай друзей, получай купоны и открывай награды сезона.":"Запрошуй друзів, отримуй купони та відкривай сезонні нагороди.","Твоя реферальная ссылка":"Твоє реферальне посилання","Приглашено":"Запрошено","всего пользователей":"усього користувачів","Платные рефералы":"Платні реферали","с оплатой подписки":"з оплатою підписки","Оборот за сезон":"Оборот за сезон","подтверждённые подписки":"підтверджені підписки","доступно":"доступно","Создай новую группу или вступи в семью по коду приглашения.":"Створи нову групу або приєднайся до сім’ї за кодом запрошення."});
Object.assign(STATIC_UI_TRANSLATIONS.en, {"Загрузить":"Upload","Приглашай друзей, получай купоны и открывай награды сезона.":"Invite friends, earn coupons, and unlock seasonal rewards.","Твоя реферальная ссылка":"Your referral link","Приглашено":"Invited","всего пользователей":"total users","Платные рефералы":"Paid referrals","с оплатой подписки":"with a paid subscription","Оборот за сезон":"Season turnover","подтверждённые подписки":"confirmed subscriptions","доступно":"available","Создай новую группу или вступи в семью по коду приглашения.":"Create a new group or join a family using an invitation code."});
Object.assign(STATIC_UI_TRANSLATIONS.de, {"Загрузить":"Hochladen","Приглашай друзей, получай купоны и открывай награды сезона.":"Lade Freunde ein, erhalte Gutscheine und schalte Saisonbelohnungen frei.","Твоя реферальная ссылка":"Dein Empfehlungslink","Приглашено":"Eingeladen","всего пользователей":"Nutzer insgesamt","Платные рефералы":"Bezahlte Empfehlungen","с оплатой подписки":"mit bezahltem Abonnement","Оборот за сезон":"Saisonumsatz","подтверждённые подписки":"bestätigte Abonnements","доступно":"verfügbar","Создай новую группу или вступи в семью по коду приглашения.":"Erstelle eine neue Gruppe oder tritt einer Familie mit einem Einladungscode bei."});
Object.assign(STATIC_UI_TRANSLATIONS.es, {"Загрузить":"Subir","Приглашай друзей, получай купоны и открывай награды сезона.":"Invita a tus amigos, consigue cupones y desbloquea recompensas de temporada.","Твоя реферальная ссылка":"Tu enlace de referido","Приглашено":"Invitados","всего пользователей":"usuarios en total","Платные рефералы":"Referidos de pago","с оплатой подписки":"con una suscripción pagada","Оборот за сезон":"Volumen de la temporada","подтверждённые подписки":"suscripciones confirmadas","доступно":"disponible","Создай новую группу или вступи в семью по коду приглашения.":"Crea un grupo nuevo o únete a una familia con un código de invitación."});
Object.assign(STATIC_UI_TRANSLATIONS.fr, {"Загрузить":"Importer","Приглашай друзей, получай купоны и открывай награды сезона.":"Invite tes amis, gagne des coupons et débloque les récompenses de la saison.","Твоя реферальная ссылка":"Ton lien de parrainage","Приглашено":"Invités","всего пользователей":"utilisateurs au total","Платные рефералы":"Parrainages payants","с оплатой подписки":"avec un abonnement payé","Оборот за сезон":"Volume de la saison","подтверждённые подписки":"abonnements confirmés","доступно":"disponible","Создай новую группу или вступи в семью по коду приглашения.":"Crée un nouveau groupe ou rejoins une famille avec un code d’invitation."});
Object.assign(STATIC_UI_TRANSLATIONS.it, {"Загрузить":"Carica","Приглашай друзей, получай купоны и открывай награды сезона.":"Invita gli amici, ottieni coupon e sblocca le ricompense stagionali.","Твоя реферальная ссылка":"Il tuo link di referral","Приглашено":"Invitati","всего пользователей":"utenti in totale","Платные рефералы":"Referral paganti","с оплатой подписки":"con abbonamento pagato","Оборот за сезон":"Volume della stagione","подтверждённые подписки":"abbonamenti confermati","доступно":"disponibile","Создай новую группу или вступи в семью по коду приглашения.":"Crea un nuovo gruppo o unisciti a una famiglia con un codice d’invito."});
Object.assign(STATIC_UI_TRANSLATIONS.pl, {"Загрузить":"Prześlij","Приглашай друзей, получай купоны и открывай награды сезона.":"Zapraszaj znajomych, zdobywaj kupony i odblokowuj nagrody sezonowe.","Твоя реферальная ссылка":"Twój link polecający","Приглашено":"Zaproszono","всего пользователей":"użytkowników łącznie","Платные рефералы":"Płatne polecenia","с оплатой подписки":"z opłaconą subskrypcją","Оборот за сезон":"Obrót w sezonie","подтверждённые подписки":"potwierdzone subskrypcje","доступно":"dostępne","Создай новую группу или вступи в семью по коду приглашения.":"Utwórz nową grupę lub dołącz do rodziny za pomocą kodu zaproszenia."});
Object.assign(STATIC_UI_TRANSLATIONS.tr, {"Загрузить":"Yükle","Приглашай друзей, получай купоны и открывай награды сезона.":"Arkadaşlarını davet et, kupon kazan ve sezon ödüllerinin kilidini aç.","Твоя реферальная ссылка":"Davet bağlantın","Приглашено":"Davet edilen","всего пользователей":"toplam kullanıcı","Платные рефералы":"Ödeme yapan davetliler","с оплатой подписки":"ücretli aboneliği olan","Оборот за сезон":"Sezon cirosu","подтверждённые подписки":"onaylanmış abonelikler","доступно":"kullanılabilir","Создай новую группу или вступи в семью по коду приглашения.":"Yeni bir grup oluştur veya davet koduyla bir aileye katıl."});
Object.assign(STATIC_UI_TRANSLATIONS.zh, {"Загрузить":"上传","Приглашай друзей, получай купоны и открывай награды сезона.":"邀请好友，获取优惠券并解锁赛季奖励。","Твоя реферальная ссылка":"你的推荐链接","Приглашено":"已邀请","всего пользователей":"用户总数","Платные рефералы":"付费推荐用户","с оплатой подписки":"已支付订阅费用","Оборот за сезон":"本赛季交易额","подтверждённые подписки":"已确认的订阅","доступно":"可用","Создай новую группу или вступи в семью по коду приглашения.":"创建新群组，或使用邀请码加入家庭。"});

const RUNTIME_TEXT_SOURCES = ["Открой приложение через Telegram.","Реферальная ссылка скопирована!","Не удалось скопировать автоматически. Выдели ссылку и скопируй её вручную.","Проверяем семейную группу…","Моя семья","Личный баланс","Общий баланс семьи","Напиши, например: «потратил 350 грн на продукты».","Разбираю…","ИИ разбирает описание…","Не нашёл сумму. Укажи её в тексте, например «кофе 85 грн».","Проверь особенно внимательно: описание неоднозначно. ","Черновик заполнен. ","Проверь тип, сумму, описание и дату операции.","Удалить эту семейную операцию?","Удалить эту операцию?","Без конверта","Изменить конверт","Изменить копилку","Новая банка","Пополнить: ","Введи сумму больше нуля.","На доступном балансе недостаточно денег.","Не удалось загрузить семейную группу.","Не удалось сохранить семейную операцию.","Не удалось сохранить операцию.","Не удалось удалить конверт.","Не удалось создать семейный конверт.","Укажи название и цель больше нуля.","Не удалось удалить копилку.","Не удалось сохранить копилку.","Доступно на семейном балансе: ","Доступно на личном балансе: ","Не удалось пополнить копилку.","Найдено операций: ","Ошибка импорта.","Операция без описания","Импорт…","Не удалось импортировать семейные операции.","Не удалось импортировать операции.","Нажми «Сохранить» только после проверки.","Платёж получен. Проверяем активацию подписки.","Оплата не прошла. Попробуй ещё раз.","ИИ анализирует бюджет…","Открой приложение через Telegram, чтобы получать награды.","Обновляю баланс купонов…","Не удалось обновить баланс. Попробуй ещё раз.","Выбери купон 10% или 20%.","Не удалось загрузить награды.","Награда за сегодня уже получена.","Ошибка получения награды.","Открой приложение через Telegram, чтобы купить купон.","Не удалось создать счёт. Попробуй ещё раз.","Ошибка создания счёта.","Ошибка оплаты: ","Создаю счёт в USDT…","Счёт создан. После оплаты запросы автоматически появятся на балансе.","Пока нет доступных ИИ-запросов. Купи пакет ниже.","Не удалось загрузить баланс ИИ-запросов.","Открой Family Budget через Telegram для покупки.","Сравнение с прошлым месяцем","Куда уходят деньги","Траты за месяц","Новый сезон начинается каждый месяц. Заработанные купоны сохраняются и после завершения сезона.","Загружаем награды…","Правил нет","＋ Создать семью","Вступить по коду","За один раз можно импортировать не больше 500 операций. Сними галочки с лишних строк и повтори.","В этой выписке несколько валют. Чтобы не исказить баланс, импортируй каждую валюту отдельным файлом.","Выбери файл CSV или XLSX.","Файл больше 8 МБ. Раздели выписку на несколько файлов.","Читаю выписку…","Не удалось прочитать выписку.","В выписке не найдено операций.","Выбери хотя бы одну корректную операцию.","Импорт завершён. Добавлено: "];
const RUNTIME_TEXT_TRANSLATIONS = {"en":["Open the app through Telegram.","Referral link copied!","Could not copy automatically. Select the link and copy it manually.","Checking family group…","My family","Personal balance","Family balance","For example: “I spent 350 UAH on groceries.”","Processing…","AI is analyzing the description…","I couldn't find the amount. Include it in the text, e.g. “coffee 85 UAH”.","Please check carefully: the description is ambiguous. ","Draft filled in. ","Check the type, amount, description and transaction date.","Delete this family transaction?","Delete this transaction?","No envelope","Edit envelope","Edit savings goal","New savings goal","Add funds: ","Enter an amount greater than zero.","Insufficient available balance.","Could not load the family group.","Could not save the family transaction.","Could not save the transaction.","Could not delete the envelope.","Could not create the family envelope.","Enter a name and a goal greater than zero.","Could not delete the savings goal.","Could not save the savings goal.","Available family balance: ","Available personal balance: ","Could not add funds to the savings goal.","Transactions found: ","Import error.","Untitled transaction","Importing…","Could not import family transactions.","Could not import transactions.","Click Save only after reviewing.","Payment received. Checking subscription activation.","Payment failed. Please try again.","AI is analyzing your budget…","Open the app through Telegram to receive rewards.","Updating coupon balance…","Could not update the balance. Try again.","Choose a 10% or 20% coupon.","Could not load rewards.","Today's reward has already been claimed.","Error claiming the reward.","Open the app through Telegram to buy a coupon.","Could not create the invoice. Please try again.","Invoice creation error.","Payment error: ","Creating a USDT invoice…","Invoice created. Requests will appear in your balance after payment.","No AI requests available. Buy a package below.","Could not load AI request balance.","Open Family Budget through Telegram to make a purchase.","Comparison with last month","Where your money goes","Monthly spending","A new season starts every month. Earned coupons remain yours after the season ends.","Loading rewards…","No rules","＋ Create family","Join with a code","You can import up to 500 transactions at a time. Uncheck extra rows and try again.","This statement contains multiple currencies. To avoid changing your balance incorrectly, import each currency in a separate file.","Choose a CSV or XLSX file.","File is larger than 8 MB. Split the statement into several files.","Reading statement…","Could not read the statement.","No transactions found in the statement.","Select at least one valid transaction.","Import complete. Added: "],"uk":["Відкрий застосунок через Telegram.","Реферальне посилання скопійовано!","Не вдалося скопіювати автоматично. Виділи посилання та скопіюй його вручну.","Перевіряємо сімейну групу…","Моя сім’я","Особистий баланс","Спільний баланс сім’ї","Напиши, наприклад: «витратив 350 грн на продукти».","Обробляю…","ШІ аналізує опис…","Не знайшов суму. Вкажи її в тексті, наприклад «кава 85 грн».","Перевір особливо уважно: опис неоднозначний. ","Чернетку заповнено. ","Перевір тип, суму, опис і дату операції.","Видалити цю сімейну операцію?","Видалити цю операцію?","Без конверта","Змінити конверт","Змінити скарбничку","Нова скарбничка","Поповнити: ","Введи суму, більшу за нуль.","На доступному балансі недостатньо коштів.","Не вдалося завантажити сімейну групу.","Не вдалося зберегти сімейну операцію.","Не вдалося зберегти операцію.","Не вдалося видалити конверт.","Не вдалося створити сімейний конверт.","Вкажи назву та ціль, більшу за нуль.","Не вдалося видалити скарбничку.","Не вдалося зберегти скарбничку.","Доступно на сімейному балансі: ","Доступно на особистому балансі: ","Не вдалося поповнити скарбничку.","Знайдено операцій: ","Помилка імпорту.","Операція без опису","Імпорт…","Не вдалося імпортувати сімейні операції.","Не вдалося імпортувати операції.","Натискай «Зберегти» лише після перевірки.","Платіж отримано. Перевіряємо активацію підписки.","Оплата не пройшла. Спробуй ще раз.","ШІ аналізує бюджет…","Відкрий застосунок через Telegram, щоб отримувати нагороди.","Оновлюю баланс купонів…","Не вдалося оновити баланс. Спробуй ще раз.","Обери купон 10% або 20%.","Не вдалося завантажити нагороди.","Нагороду за сьогодні вже отримано.","Помилка отримання нагороди.","Відкрий застосунок через Telegram, щоб купити купон.","Не вдалося створити рахунок. Спробуй ще раз.","Помилка створення рахунку.","Помилка оплати: ","Створюю рахунок у USDT…","Рахунок створено. Після оплати запити автоматично з’являться на балансі.","Немає доступних ШІ-запитів. Придбай пакет нижче.","Не вдалося завантажити баланс ШІ-запитів.","Відкрий Family Budget через Telegram для покупки.","Порівняння з минулим місяцем","Куди йдуть гроші","Витрати за місяць","Новий сезон починається щомісяця. Зароблені купони залишаються після завершення сезону.","Завантажуємо нагороди…","Правил немає","＋ Створити сім’ю","Приєднатися за кодом","За один раз можна імпортувати не більше 500 операцій. Зніми позначки із зайвих рядків і повтори.","У цій виписці кілька валют. Щоб не спотворити баланс, імпортуй кожну валюту окремим файлом.","Обери файл CSV або XLSX.","Файл більший за 8 МБ. Розділи виписку на кілька файлів.","Читаю виписку…","Не вдалося прочитати виписку.","У виписці не знайдено операцій.","Обери хоча б одну коректну операцію.","Імпорт завершено. Додано: "],"de":["Öffne die App über Telegram.","Empfehlungslink kopiert!","Automatisches Kopieren fehlgeschlagen. Markiere den Link und kopiere ihn manuell.","Familiengruppe wird geprüft…","Meine Familie","Persönlicher Kontostand","Gemeinsamer Familienkontostand","Schreibe zum Beispiel: „350 UAH für Lebensmittel ausgegeben“.","Verarbeite…","KI analysiert die Beschreibung…","Betrag nicht gefunden. Gib ihn im Text an, z. B. „Kaffee 85 UAH“.","Bitte besonders sorgfältig prüfen: Die Beschreibung ist mehrdeutig. ","Entwurf ausgefüllt. ","Prüfe Typ, Betrag, Beschreibung und Transaktionsdatum.","Diese Familientransaktion löschen?","Diese Transaktion löschen?","Ohne Umschlag","Umschlag bearbeiten","Sparziel bearbeiten","Neues Sparziel","Einzahlen: ","Gib einen Betrag größer als null ein.","Das verfügbare Guthaben reicht nicht aus.","Familiengruppe konnte nicht geladen werden.","Familientransaktion konnte nicht gespeichert werden.","Transaktion konnte nicht gespeichert werden.","Umschlag konnte nicht gelöscht werden.","Familienumschlag konnte nicht erstellt werden.","Gib einen Namen und ein Ziel größer als null ein.","Sparziel konnte nicht gelöscht werden.","Sparziel konnte nicht gespeichert werden.","Verfügbares Familienguthaben: ","Verfügbares persönliches Guthaben: ","Einzahlung auf das Sparziel fehlgeschlagen.","Transaktionen gefunden: ","Importfehler.","Transaktion ohne Beschreibung","Importiere…","Familientransaktionen konnten nicht importiert werden.","Transaktionen konnten nicht importiert werden.","Klicke erst nach der Prüfung auf „Speichern“.","Zahlung erhalten. Abonnementaktivierung wird geprüft.","Zahlung fehlgeschlagen. Bitte erneut versuchen.","KI analysiert dein Budget…","Öffne die App über Telegram, um Belohnungen zu erhalten.","Gutscheinbestand wird aktualisiert…","Guthaben konnte nicht aktualisiert werden. Bitte erneut versuchen.","Wähle einen Gutschein über 10 % oder 20 %.","Belohnungen konnten nicht geladen werden.","Die heutige Belohnung wurde bereits abgeholt.","Fehler beim Abholen der Belohnung.","Öffne die App über Telegram, um einen Gutschein zu kaufen.","Rechnung konnte nicht erstellt werden. Bitte erneut versuchen.","Fehler beim Erstellen der Rechnung.","Zahlungsfehler: ","USDT-Rechnung wird erstellt…","Rechnung erstellt. Nach der Zahlung werden die Anfragen automatisch deinem Guthaben hinzugefügt.","Keine KI-Anfragen verfügbar. Kaufe unten ein Paket.","KI-Anfrageguthaben konnte nicht geladen werden.","Öffne Family Budget über Telegram, um einzukaufen.","Vergleich mit dem Vormonat","Wofür du Geld ausgibst","Ausgaben im Monat","Jeden Monat beginnt eine neue Saison. Verdiente Gutscheine bleiben auch nach Saisonende erhalten.","Belohnungen werden geladen…","Keine Regeln","＋ Familie erstellen","Mit Code beitreten","Pro Import können höchstens 500 Transaktionen importiert werden. Deaktiviere zusätzliche Zeilen und versuche es erneut.","Dieser Kontoauszug enthält mehrere Währungen. Importiere jede Währung in einer separaten Datei, damit dein Kontostand korrekt bleibt.","CSV- oder XLSX-Datei auswählen.","Datei größer als 8 MB. Teile den Kontoauszug in mehrere Dateien auf.","Kontoauszug wird gelesen…","Kontoauszug konnte nicht gelesen werden.","Keine Transaktionen im Kontoauszug gefunden.","Wähle mindestens eine gültige Transaktion aus.","Import abgeschlossen. Hinzugefügt: "],"es":["Abre la aplicación desde Telegram.","¡Enlace de referido copiado!","No se pudo copiar automáticamente. Selecciona el enlace y cópialo manualmente.","Comprobando el grupo familiar…","Mi familia","Saldo personal","Saldo familiar compartido","Escribe, por ejemplo: «gasté 350 UAH en comida».","Procesando…","La IA está analizando la descripción…","No encontré el importe. Indícalo en el texto, por ejemplo «café 85 UAH».","Revisa con especial atención: la descripción es ambigua. ","Borrador completado. ","Comprueba el tipo, el importe, la descripción y la fecha de la operación.","¿Eliminar esta operación familiar?","¿Eliminar esta operación?","Sin sobre","Editar sobre","Editar objetivo de ahorro","Nuevo objetivo de ahorro","Añadir fondos: ","Introduce un importe mayor que cero.","Saldo disponible insuficiente.","No se pudo cargar el grupo familiar.","No se pudo guardar la operación familiar.","No se pudo guardar la operación.","No se pudo eliminar el sobre.","No se pudo crear el sobre familiar.","Indica un nombre y un objetivo mayor que cero.","No se pudo eliminar el objetivo de ahorro.","No se pudo guardar el objetivo de ahorro.","Disponible en el saldo familiar: ","Disponible en el saldo personal: ","No se pudo añadir dinero al objetivo.","Operaciones encontradas: ","Error de importación.","Operación sin descripción","Importando…","No se pudieron importar las operaciones familiares.","No se pudieron importar las operaciones.","Pulsa «Guardar» solo después de revisar.","Pago recibido. Comprobando la activación de la suscripción.","El pago ha fallado. Inténtalo de nuevo.","La IA está analizando tu presupuesto…","Abre la aplicación desde Telegram para recibir recompensas.","Actualizando el saldo de cupones…","No se pudo actualizar el saldo. Inténtalo de nuevo.","Elige un cupón del 10 % o del 20 %.","No se pudieron cargar las recompensas.","Ya has recibido la recompensa de hoy.","Error al reclamar la recompensa.","Abre la aplicación desde Telegram para comprar un cupón.","No se pudo crear la factura. Inténtalo de nuevo.","Error al crear la factura.","Error de pago: ","Creando factura en USDT…","Factura creada. Tras el pago, las solicitudes aparecerán automáticamente en tu saldo.","No hay solicitudes de IA disponibles. Compra un paquete abajo.","No se pudo cargar el saldo de solicitudes de IA.","Abre Family Budget desde Telegram para comprar.","Comparación con el mes anterior","En qué se va tu dinero","Gastos del mes","Cada mes comienza una nueva temporada. Los cupones obtenidos se conservan cuando termina la temporada.","Cargando recompensas…","No hay reglas","＋ Crear familia","Unirse con código","Puedes importar hasta 500 operaciones a la vez. Desmarca las filas adicionales e inténtalo de nuevo.","Este extracto contiene varias monedas. Para no alterar el saldo, importa cada moneda en un archivo separado.","Selecciona un archivo CSV o XLSX.","El archivo supera los 8 MB. Divide el extracto en varios archivos.","Leyendo extracto…","No se pudo leer el extracto.","No se encontraron operaciones en el extracto.","Selecciona al menos una operación válida.","Importación completada. Añadidas: "],"fr":["Ouvre l’application depuis Telegram.","Lien de parrainage copié !","La copie automatique a échoué. Sélectionne le lien et copie-le manuellement.","Vérification du groupe familial…","Ma famille","Solde personnel","Solde familial commun","Écris par exemple : « dépensé 350 UAH en courses ».","Traitement…","L’IA analyse la description…","Montant introuvable. Indique-le dans le texte, par exemple « café 85 UAH ».","Vérifie attentivement : la description est ambiguë. ","Brouillon rempli. ","Vérifie le type, le montant, la description et la date de l’opération.","Supprimer cette opération familiale ?","Supprimer cette opération ?","Sans enveloppe","Modifier l’enveloppe","Modifier l’objectif d’épargne","Nouvel objectif d’épargne","Ajouter des fonds : ","Saisis un montant supérieur à zéro.","Solde disponible insuffisant.","Impossible de charger le groupe familial.","Impossible d’enregistrer l’opération familiale.","Impossible d’enregistrer l’opération.","Impossible de supprimer l’enveloppe.","Impossible de créer l’enveloppe familiale.","Indique un nom et un objectif supérieur à zéro.","Impossible de supprimer l’objectif d’épargne.","Impossible d’enregistrer l’objectif d’épargne.","Disponible sur le solde familial : ","Disponible sur le solde personnel : ","Impossible d’alimenter l’objectif d’épargne.","Opérations trouvées : ","Erreur d’importation.","Opération sans description","Importation…","Impossible d’importer les opérations familiales.","Impossible d’importer les opérations.","Clique sur « Enregistrer » uniquement après vérification.","Paiement reçu. Vérification de l’activation de l’abonnement.","Échec du paiement. Réessaie.","L’IA analyse ton budget…","Ouvre l’application depuis Telegram pour recevoir des récompenses.","Mise à jour du solde des coupons…","Impossible de mettre à jour le solde. Réessaie.","Choisis un coupon de 10 % ou de 20 %.","Impossible de charger les récompenses.","La récompense du jour a déjà été récupérée.","Erreur lors de la récupération de la récompense.","Ouvre l’application depuis Telegram pour acheter un coupon.","Impossible de créer la facture. Réessaie.","Erreur lors de la création de la facture.","Erreur de paiement : ","Création d’une facture en USDT…","Facture créée. Après le paiement, les requêtes seront automatiquement ajoutées à ton solde.","Aucune requête IA disponible. Achète un forfait ci-dessous.","Impossible de charger le solde des requêtes IA.","Ouvre Family Budget via Telegram pour effectuer un achat.","Comparaison avec le mois dernier","Où va ton argent","Dépenses du mois","Une nouvelle saison commence chaque mois. Les coupons gagnés sont conservés après la fin de la saison.","Chargement des récompenses…","Aucune règle","＋ Créer une famille","Rejoindre avec un code","Tu peux importer au maximum 500 opérations à la fois. Décoche les lignes supplémentaires et réessaie.","Ce relevé contient plusieurs devises. Pour ne pas fausser le solde, importe chaque devise dans un fichier séparé.","Choisis un fichier CSV ou XLSX.","Le fichier dépasse 8 Mo. Divise le relevé en plusieurs fichiers.","Lecture du relevé…","Impossible de lire le relevé.","Aucune opération trouvée dans le relevé.","Sélectionne au moins une opération valide.","Importation terminée. Ajoutées : "],"it":["Apri l’app tramite Telegram.","Link di invito copiato!","Impossibile copiare automaticamente. Seleziona il link e copialo manualmente.","Verifica del gruppo famiglia…","La mia famiglia","Saldo personale","Saldo familiare condiviso","Scrivi, ad esempio: «ho speso 350 UAH per la spesa».","Elaborazione…","L’IA sta analizzando la descrizione…","Importo non trovato. Indicalo nel testo, ad esempio «caffè 85 UAH».","Controlla con attenzione: la descrizione è ambigua. ","Bozza compilata. ","Controlla tipo, importo, descrizione e data dell’operazione.","Eliminare questa operazione familiare?","Eliminare questa operazione?","Senza busta","Modifica busta","Modifica obiettivo di risparmio","Nuovo obiettivo di risparmio","Aggiungi fondi: ","Inserisci un importo maggiore di zero.","Saldo disponibile insufficiente.","Impossibile caricare il gruppo famiglia.","Impossibile salvare l’operazione familiare.","Impossibile salvare l’operazione.","Impossibile eliminare la busta.","Impossibile creare la busta familiare.","Inserisci un nome e un obiettivo maggiore di zero.","Impossibile eliminare l’obiettivo di risparmio.","Impossibile salvare l’obiettivo di risparmio.","Disponibile nel saldo familiare: ","Disponibile nel saldo personale: ","Impossibile aggiungere fondi all’obiettivo.","Operazioni trovate: ","Errore di importazione.","Operazione senza descrizione","Importazione…","Impossibile importare le operazioni familiari.","Impossibile importare le operazioni.","Premi «Salva» solo dopo aver controllato.","Pagamento ricevuto. Verifica dell’attivazione dell’abbonamento.","Pagamento non riuscito. Riprova.","L’IA sta analizzando il tuo budget…","Apri l’app tramite Telegram per ricevere i premi.","Aggiornamento del saldo dei coupon…","Impossibile aggiornare il saldo. Riprova.","Scegli un coupon del 10% o del 20%.","Impossibile caricare i premi.","Hai già riscosso il premio di oggi.","Errore durante la riscossione del premio.","Apri l’app tramite Telegram per acquistare un coupon.","Impossibile creare la fattura. Riprova.","Errore nella creazione della fattura.","Errore di pagamento: ","Creazione fattura in USDT…","Fattura creata. Dopo il pagamento, le richieste appariranno automaticamente nel saldo.","Nessuna richiesta IA disponibile. Acquista un pacchetto qui sotto.","Impossibile caricare il saldo delle richieste IA.","Apri Family Budget tramite Telegram per acquistare.","Confronto con il mese scorso","Dove finiscono i tuoi soldi","Spese del mese","Ogni mese inizia una nuova stagione. I coupon guadagnati restano disponibili anche dopo la fine della stagione.","Caricamento premi…","Nessuna regola","＋ Crea famiglia","Unisciti con un codice","Puoi importare al massimo 500 operazioni alla volta. Deseleziona le righe aggiuntive e riprova.","Questo estratto contiene più valute. Per non alterare il saldo, importa ogni valuta in un file separato.","Seleziona un file CSV o XLSX.","Il file supera gli 8 MB. Dividi l’estratto in più file.","Lettura dell’estratto…","Impossibile leggere l’estratto.","Nessuna operazione trovata nell’estratto.","Seleziona almeno un’operazione valida.","Importazione completata. Aggiunte: "],"pl":["Otwórz aplikację przez Telegram.","Skopiowano link polecający!","Nie udało się skopiować automatycznie. Zaznacz link i skopiuj go ręcznie.","Sprawdzanie grupy rodzinnej…","Moja rodzina","Saldo osobiste","Wspólne saldo rodziny","Napisz na przykład: „wydałem 350 UAH na zakupy”.","Przetwarzanie…","AI analizuje opis…","Nie znaleziono kwoty. Podaj ją w tekście, np. „kawa 85 UAH”.","Sprawdź dokładnie: opis jest niejednoznaczny. ","Szkic został uzupełniony. ","Sprawdź typ, kwotę, opis i datę transakcji.","Usunąć tę transakcję rodzinną?","Usunąć tę transakcję?","Bez koperty","Edytuj kopertę","Edytuj cel oszczędnościowy","Nowy cel oszczędnościowy","Dodaj środki: ","Wpisz kwotę większą od zera.","Niewystarczające dostępne saldo.","Nie udało się załadować grupy rodzinnej.","Nie udało się zapisać transakcji rodzinnej.","Nie udało się zapisać transakcji.","Nie udało się usunąć koperty.","Nie udało się utworzyć koperty rodzinnej.","Podaj nazwę i cel większy od zera.","Nie udało się usunąć celu oszczędnościowego.","Nie udało się zapisać celu oszczędnościowego.","Dostępne saldo rodzinne: ","Dostępne saldo osobiste: ","Nie udało się dodać środków do celu.","Znalezione transakcje: ","Błąd importu.","Transakcja bez opisu","Importowanie…","Nie udało się zaimportować transakcji rodzinnych.","Nie udało się zaimportować transakcji.","Kliknij „Zapisz” dopiero po sprawdzeniu.","Płatność otrzymana. Sprawdzanie aktywacji subskrypcji.","Płatność nie powiodła się. Spróbuj ponownie.","AI analizuje Twój budżet…","Otwórz aplikację przez Telegram, aby otrzymywać nagrody.","Aktualizowanie salda kuponów…","Nie udało się zaktualizować salda. Spróbuj ponownie.","Wybierz kupon 10% lub 20%.","Nie udało się załadować nagród.","Dzisiejsza nagroda została już odebrana.","Błąd odbierania nagrody.","Otwórz aplikację przez Telegram, aby kupić kupon.","Nie udało się utworzyć rachunku. Spróbuj ponownie.","Błąd tworzenia rachunku.","Błąd płatności: ","Tworzenie rachunku USDT…","Rachunek utworzony. Po płatności zapytania pojawią się automatycznie na saldzie.","Brak dostępnych zapytań AI. Kup pakiet poniżej.","Nie udało się załadować salda zapytań AI.","Otwórz Family Budget przez Telegram, aby dokonać zakupu.","Porównanie z poprzednim miesiącem","Na co wydajesz pieniądze","Wydatki w tym miesiącu","Nowy sezon rozpoczyna się co miesiąc. Zdobyte kupony pozostają dostępne po zakończeniu sezonu.","Ładowanie nagród…","Brak zasad","＋ Utwórz rodzinę","Dołącz za pomocą kodu","Jednorazowo można zaimportować maksymalnie 500 transakcji. Odznacz dodatkowe wiersze i spróbuj ponownie.","Ten wyciąg zawiera kilka walut. Aby nie zniekształcić salda, importuj każdą walutę z osobnego pliku.","Wybierz plik CSV lub XLSX.","Plik jest większy niż 8 MB. Podziel wyciąg na kilka plików.","Odczytywanie wyciągu…","Nie udało się odczytać wyciągu.","Nie znaleziono transakcji na wyciągu.","Wybierz co najmniej jedną prawidłową transakcję.","Import zakończony. Dodano: "],"tr":["Uygulamayı Telegram üzerinden aç.","Referans bağlantısı kopyalandı!","Otomatik kopyalama başarısız. Bağlantıyı seçip elle kopyala.","Aile grubu kontrol ediliyor…","Ailem","Kişisel bakiye","Ortak aile bakiyesi","Örneğin şöyle yaz: “market için 350 UAH harcadım”.","İşleniyor…","Yapay zekâ açıklamayı inceliyor…","Tutarı bulamadım. Metinde belirt; örneğin “kahve 85 UAH”.","Özellikle dikkatlice kontrol et: açıklama belirsiz. ","Taslak dolduruldu. ","İşlem türünü, tutarı, açıklamayı ve tarihi kontrol et.","Bu aile işlemi silinsin mi?","Bu işlem silinsin mi?","Zarf yok","Zarfı düzenle","Birikim hedefini düzenle","Yeni birikim hedefi","Para ekle: ","Sıfırdan büyük bir tutar gir.","Kullanılabilir bakiye yetersiz.","Aile grubu yüklenemedi.","Aile işlemi kaydedilemedi.","İşlem kaydedilemedi.","Zarf silinemedi.","Aile zarfı oluşturulamadı.","Bir ad ve sıfırdan büyük bir hedef gir.","Birikim hedefi silinemedi.","Birikim hedefi kaydedilemedi.","Aile bakiyesinde kullanılabilir: ","Kişisel bakiyede kullanılabilir: ","Birikim hedefine para eklenemedi.","Bulunan işlemler: ","İçe aktarma hatası.","Açıklamasız işlem","İçe aktarılıyor…","Aile işlemleri içe aktarılamadı.","İşlemler içe aktarılamadı.","Kontrol ettikten sonra «Kaydet» düğmesine bas.","Ödeme alındı. Abonelik etkinleştirmesi kontrol ediliyor.","Ödeme başarısız. Tekrar dene.","Yapay zekâ bütçeni analiz ediyor…","Ödülleri almak için uygulamayı Telegram üzerinden aç.","Kupon bakiyesi güncelleniyor…","Bakiye güncellenemedi. Tekrar dene.","%10 veya %20 kupon seç.","Ödüller yüklenemedi.","Bugünün ödülü zaten alındı.","Ödül alınırken hata oluştu.","Kupon satın almak için uygulamayı Telegram üzerinden aç.","Fatura oluşturulamadı. Tekrar dene.","Fatura oluşturma hatası.","Ödeme hatası: ","USDT faturası oluşturuluyor…","Fatura oluşturuldu. Ödeme sonrası istekler otomatik olarak bakiyene eklenecek.","Kullanılabilir yapay zekâ isteği yok. Aşağıdan paket satın al.","Yapay zekâ istek bakiyesi yüklenemedi.","Satın almak için Family Budget'ı Telegram üzerinden aç.","Geçen ayla karşılaştırma","Paran nereye gidiyor","Aylık harcamalar","Her ay yeni bir sezon başlar. Kazanılan kuponlar sezon bittikten sonra da sende kalır.","Ödüller yükleniyor…","Kural yok","＋ Aile oluştur","Kodla katıl","Bir seferde en fazla 500 işlem içe aktarabilirsin. Fazla satırların işaretini kaldırıp tekrar dene.","Bu ekstrede birden fazla para birimi var. Bakiyeyi bozmamak için her para birimini ayrı dosyadan içe aktar.","CSV veya XLSX dosyası seç.","Dosya 8 MB'tan büyük. Ekstreyi birkaç dosyaya böl.","Ekstre okunuyor…","Ekstre okunamadı.","Ekstrede işlem bulunamadı.","En az bir geçerli işlem seç.","İçe aktarma tamamlandı. Eklenen: "],"zh":["通过 Telegram 打开应用。","推荐链接已复制！","无法自动复制。请选择链接并手动复制。","正在检查家庭组…","我的家庭","个人余额","家庭共同余额","例如输入：“买菜花了 350 UAH”。","处理中…","AI 正在分析描述…","未找到金额。请在文本中填写，例如“咖啡 85 UAH”。","请特别仔细检查：描述存在歧义。 ","草稿已填写。 ","请检查交易类型、金额、描述和日期。","删除这笔家庭交易吗？","删除这笔交易吗？","无信封","编辑信封","编辑储蓄目标","新建储蓄目标","存入： ","请输入大于零的金额。","可用余额不足。","无法加载家庭组。","无法保存家庭交易。","无法保存交易。","无法删除信封。","无法创建家庭信封。","请输入名称和大于零的目标金额。","无法删除储蓄目标。","无法保存储蓄目标。","家庭余额可用： ","个人余额可用： ","无法向储蓄目标存入资金。","找到的交易： ","导入错误。","未命名交易","正在导入…","无法导入家庭交易。","无法导入交易。","检查无误后再点击“保存”。","已收到付款。正在检查订阅是否激活。","付款失败，请重试。","AI 正在分析你的预算…","请通过 Telegram 打开应用以领取奖励。","正在更新优惠券余额…","无法更新余额，请重试。","请选择 10% 或 20% 优惠券。","无法加载奖励。","今日奖励已领取。","领取奖励时出错。","请通过 Telegram 打开应用以购买优惠券。","无法创建账单，请重试。","创建账单时出错。","付款错误：","正在创建 USDT 账单…","账单已创建。付款后，请求次数将自动添加到余额。","没有可用的 AI 请求。请在下方购买套餐。","无法加载 AI 请求余额。","请通过 Telegram 打开 Family Budget 进行购买。","与上月比较","资金去向","本月支出","每月开启新赛季。赛季结束后，已获得的优惠券仍会保留。","正在加载奖励…","暂无规则","＋ 创建家庭","使用邀请码加入","每次最多可导入 500 笔交易。请取消多余行的勾选后重试。","此账单包含多种货币。为避免余额计算错误，请将每种货币分别导入单独文件。","选择 CSV 或 XLSX 文件。","文件超过 8 MB。请将账单拆分为多个文件。","正在读取账单…","无法读取账单。","账单中未找到交易。","请至少选择一笔有效交易。","导入完成。已添加："]};

const RUNTIME_TEXT_SOURCES_EXTRA = ["🎟️ Купон −10%","🎟️ Купон −20%","1 ИИ-запрос","Оборот за сезон","доступно","Скидка 10% выбрана. Купон спишется после подтверждения оплаты.","Скидка 20% выбрана. Купон спишется после подтверждения оплаты.","Выбери доступный купон или продолжай без скидки. Купон списывается только после оплаты.","Открой приложение через Telegram, чтобы получить ссылку","Расширенная аналитика PRO","Сравнение с прошлым месяцем, топ категорий, средние дневные траты и прогноз до конца месяца.","Привет! Я помогу разобраться с расходами, найти возможности для экономии и оценить бюджет. Задай вопрос ниже.","Создаю счёт Crypto Pay на ","Счёт создан на ","Приглашай друзей, получай купоны и открывай награды сезона.","Твоя реферальная ссылка","Приглашено","всего пользователей","Платные рефералы","с оплатой подписки","подтверждённые подписки","Создай новую группу или вступи в семью по коду приглашения."];
const RUNTIME_TEXT_TRANSLATIONS_EXTRA = {"en":["🎟️ 10% coupon","🎟️ 20% coupon","1 AI request","Season turnover","available","10% discount selected. The coupon will be used after payment is confirmed.","20% discount selected. The coupon will be used after payment is confirmed.","Choose an available coupon or continue without a discount. The coupon is deducted only after payment.","Open the app through Telegram to get your link","Advanced PRO analytics","Comparison with last month, top categories, average daily spending and forecast for the rest of the month.","Hi! I can help you understand your spending, find ways to save and assess your budget. Ask a question below.","Creating a Crypto Pay invoice for ","Invoice created for ","Invite friends, earn coupons and unlock season rewards.","Your referral link","Invited","total users","Paid referrals","with a subscription payment","confirmed subscriptions","Create a new group or join a family using an invitation code."],"uk":["🎟️ Купон 10%","🎟️ Купон 20%","1 ШІ-запит","Оборот за сезон","доступно","Знижку 10% обрано. Купон буде списано після підтвердження оплати.","Знижку 20% обрано. Купон буде списано після підтвердження оплати.","Обери доступний купон або продовжуй без знижки. Купон списується лише після оплати.","Відкрий застосунок через Telegram, щоб отримати посилання","Розширена аналітика PRO","Порівняння з минулим місяцем, топ категорій, середні щоденні витрати та прогноз до кінця місяця.","Привіт! Я допоможу розібратися з витратами, знайти можливості для заощадження та оцінити бюджет. Постав запитання нижче.","Створюю рахунок Crypto Pay на ","Рахунок створено на ","Запрошуй друзів, отримуй купони та відкривай нагороди сезону.","Твоє реферальне посилання","Запрошено","усього користувачів","Платні реферали","з оплатою підписки","підтверджені підписки","Створи нову групу або приєднайся до сім’ї за кодом запрошення."],"de":["🎟️ 10-%-Gutschein","🎟️ 20-%-Gutschein","1 KI-Anfrage","Saisonumsatz","verfügbar","10-%-Rabatt ausgewählt. Der Gutschein wird nach Zahlungsbestätigung eingelöst.","20-%-Rabatt ausgewählt. Der Gutschein wird nach Zahlungsbestätigung eingelöst.","Wähle einen verfügbaren Gutschein oder fahre ohne Rabatt fort. Der Gutschein wird erst nach der Zahlung abgezogen.","Öffne die App über Telegram, um deinen Link zu erhalten","Erweiterte PRO-Analysen","Vergleich mit dem Vormonat, Top-Kategorien, durchschnittliche Tagesausgaben und Prognose bis Monatsende.","Hallo! Ich helfe dir, deine Ausgaben zu verstehen, Sparmöglichkeiten zu finden und dein Budget einzuschätzen. Stelle unten eine Frage.","Crypto-Pay-Rechnung wird erstellt für ","Rechnung erstellt über ","Lade Freunde ein, sammle Gutscheine und schalte Saisonbelohnungen frei.","Dein Empfehlungslink","Eingeladen","Nutzer insgesamt","Bezahlte Empfehlungen","mit Abonnementzahlung","bestätigte Abonnements","Erstelle eine neue Gruppe oder tritt einer Familie mit einem Einladungscode bei."],"es":["🎟️ Cupón del 10 %","🎟️ Cupón del 20 %","1 solicitud de IA","Volumen de la temporada","disponible","Descuento del 10 % seleccionado. El cupón se utilizará cuando se confirme el pago.","Descuento del 20 % seleccionado. El cupón se utilizará cuando se confirme el pago.","Elige un cupón disponible o continúa sin descuento. El cupón solo se descuenta después del pago.","Abre la aplicación desde Telegram para obtener tu enlace","Analítica avanzada PRO","Comparación con el mes anterior, categorías principales, gasto diario medio y previsión hasta fin de mes.","¡Hola! Puedo ayudarte a entender tus gastos, encontrar formas de ahorrar y evaluar tu presupuesto. Haz una pregunta abajo.","Creando factura de Crypto Pay por ","Factura creada por ","Invita a tus amigos, consigue cupones y desbloquea recompensas de temporada.","Tu enlace de referido","Invitados","usuarios en total","Referidos de pago","con pago de suscripción","suscripciones confirmadas","Crea un grupo nuevo o únete a una familia con un código de invitación."],"fr":["🎟️ Coupon de 10 %","🎟️ Coupon de 20 %","1 requête IA","Chiffre d’affaires de la saison","disponible","Remise de 10 % sélectionnée. Le coupon sera utilisé après confirmation du paiement.","Remise de 20 % sélectionnée. Le coupon sera utilisé après confirmation du paiement.","Choisis un coupon disponible ou continue sans remise. Le coupon n’est déduit qu’après le paiement.","Ouvre l’application depuis Telegram pour obtenir ton lien","Analyses avancées PRO","Comparaison avec le mois dernier, principales catégories, dépenses quotidiennes moyennes et prévision jusqu’à la fin du mois.","Bonjour ! Je peux t’aider à comprendre tes dépenses, trouver des moyens d’économiser et évaluer ton budget. Pose une question ci-dessous.","Création d’une facture Crypto Pay de ","Facture créée pour ","Invite des amis, gagne des coupons et débloque les récompenses de saison.","Ton lien de parrainage","Invités","utilisateurs au total","Parrainages payants","avec paiement de l’abonnement","abonnements confirmés","Crée un nouveau groupe ou rejoins une famille avec un code d’invitation."],"it":["🎟️ Coupon 10%","🎟️ Coupon 20%","1 richiesta IA","Volume della stagione","disponibile","Sconto del 10% selezionato. Il coupon verrà utilizzato dopo la conferma del pagamento.","Sconto del 20% selezionato. Il coupon verrà utilizzato dopo la conferma del pagamento.","Scegli un coupon disponibile o continua senza sconto. Il coupon viene scalato solo dopo il pagamento.","Apri l’app tramite Telegram per ottenere il tuo link","Analisi avanzate PRO","Confronto con il mese scorso, categorie principali, spesa media giornaliera e previsione fino alla fine del mese.","Ciao! Posso aiutarti a capire le spese, trovare modi per risparmiare e valutare il tuo budget. Fai una domanda qui sotto.","Creazione fattura Crypto Pay per ","Fattura creata per ","Invita amici, ottieni coupon e sblocca i premi della stagione.","Il tuo link di invito","Invitati","utenti totali","Inviti paganti","con pagamento dell’abbonamento","abbonamenti confermati","Crea un nuovo gruppo o entra in una famiglia con un codice di invito."],"pl":["🎟️ Kupon 10%","🎟️ Kupon 20%","1 zapytanie AI","Obrót sezonu","dostępne","Wybrano rabat 10%. Kupon zostanie wykorzystany po potwierdzeniu płatności.","Wybrano rabat 20%. Kupon zostanie wykorzystany po potwierdzeniu płatności.","Wybierz dostępny kupon lub kontynuuj bez rabatu. Kupon jest odejmowany dopiero po płatności.","Otwórz aplikację przez Telegram, aby otrzymać swój link","Zaawansowana analityka PRO","Porównanie z poprzednim miesiącem, najpopularniejsze kategorie, średnie dzienne wydatki i prognoza do końca miesiąca.","Cześć! Pomogę Ci zrozumieć wydatki, znaleźć sposoby na oszczędzanie i ocenić budżet. Zadaj pytanie poniżej.","Tworzenie rachunku Crypto Pay na ","Rachunek utworzony na ","Zaproś znajomych, zdobywaj kupony i odblokowuj nagrody sezonowe.","Twój link polecający","Zaproszono","użytkowników łącznie","Płatne polecenia","z opłaconą subskrypcją","potwierdzone subskrypcje","Utwórz nową grupę lub dołącz do rodziny za pomocą kodu zaproszenia."],"tr":["🎟️ %10 kupon","🎟️ %20 kupon","1 yapay zekâ isteği","Sezon cirosu","kullanılabilir","%10 indirim seçildi. Kupon, ödeme onaylandıktan sonra kullanılacak.","%20 indirim seçildi. Kupon, ödeme onaylandıktan sonra kullanılacak.","Kullanılabilir bir kupon seç veya indirim olmadan devam et. Kupon yalnızca ödeme sonrasında bakiyeden düşülür.","Bağlantını almak için uygulamayı Telegram üzerinden aç","Gelişmiş PRO analizleri","Geçen ayla karşılaştırma, en çok harcanan kategoriler, günlük ortalama harcama ve ay sonuna kadar tahmin.","Merhaba! Harcamalarını anlamana, tasarruf fırsatlarını bulmana ve bütçeni değerlendirmene yardımcı olabilirim. Aşağıdan bir soru sor.","Crypto Pay faturası oluşturuluyor: ","Fatura oluşturuldu: ","Arkadaşlarını davet et, kupon kazan ve sezon ödüllerini aç.","Referans bağlantın","Davet edilen","toplam kullanıcı","Ücretli referanslar","abonelik ödemesi yapan","onaylanmış abonelik","Yeni bir grup oluştur veya davet koduyla bir aileye katıl."],"zh":["🎟️ 10% 优惠券","🎟️ 20% 优惠券","1 次 AI 请求","赛季交易额","可用","已选择 10% 折扣。付款确认后将使用优惠券。","已选择 20% 折扣。付款确认后将使用优惠券。","选择可用优惠券，或不使用折扣继续。优惠券仅在付款后扣除。","通过 Telegram 打开应用以获取你的链接","PRO 高级分析","与上月比较、支出最多的分类、日均支出以及月底前的预测。","你好！我可以帮你了解支出、寻找节省机会并评估预算。请在下方提问。","正在创建 Crypto Pay 账单，金额：","账单已创建，金额：","邀请好友，获取优惠券并解锁赛季奖励。","你的推荐链接","已邀请","用户总数","付费推荐","已支付订阅费用","已确认的订阅","创建新群组，或使用邀请码加入家庭。"]};

const RUNTIME_TEXT_SOURCES_FOURTH = ["Не удалось разобрать операцию.","Разобрать","Сохранить изменения","Новый конверт","Операция удалена.","Не удалось удалить операцию.","Экспорт Excel","Ошибка экспорта","Excel-файл отправлен в Telegram","Не удалось экспортировать файл. Попробуй ещё раз.","Персональные обои","Сначала создай семейную группу или присоединись к ней.","Не удалось загрузить семейные операции.","Не удалось загрузить семейные конверты.","Не удалось загрузить семейные копилки.","Открой «Семейный бюджет» через Telegram, чтобы управлять семьёй.","Не удалось выполнить запрос.","Создание семейного бюджета","Проверь подключение и открой приложение из Telegram.","Создаём семейную группу…"];
const RUNTIME_TEXT_TRANSLATIONS_FOURTH = {"en":["Could not parse the transaction.","Analyze","Save changes","New envelope","Transaction deleted.","Could not delete the transaction.","Export to Excel","Export error","Excel file sent to Telegram","Could not export the file. Please try again.","Personal wallpapers","Create or join a family group first.","Could not load family transactions.","Could not load family envelopes.","Could not load family savings goals.","Open Family Budget through Telegram to manage your family.","Could not complete the request.","Setting up family budget","Check your connection and open the app from Telegram.","Creating family group…"],"uk":["Не вдалося розібрати операцію.","Розібрати","Зберегти зміни","Новий конверт","Операцію видалено.","Не вдалося видалити операцію.","Експорт в Excel","Помилка експорту","Файл Excel надіслано в Telegram","Не вдалося експортувати файл. Спробуй ще раз.","Персональні шпалери","Спочатку створи сімейну групу або приєднайся до неї.","Не вдалося завантажити сімейні операції.","Не вдалося завантажити сімейні конверти.","Не вдалося завантажити сімейні скарбнички.","Відкрий «Сімейний бюджет» через Telegram, щоб керувати сім’єю.","Не вдалося виконати запит.","Створення сімейного бюджету","Перевір підключення та відкрий застосунок із Telegram.","Створюємо сімейну групу…"],"de":["Transaktion konnte nicht analysiert werden.","Analysieren","Änderungen speichern","Neuer Umschlag","Transaktion gelöscht.","Transaktion konnte nicht gelöscht werden.","Nach Excel exportieren","Exportfehler","Excel-Datei an Telegram gesendet","Datei konnte nicht exportiert werden. Bitte erneut versuchen.","Persönliche Hintergrundbilder","Erstelle zuerst eine Familiengruppe oder tritt einer bei.","Familientransaktionen konnten nicht geladen werden.","Familienumschläge konnten nicht geladen werden.","Familiensparziele konnten nicht geladen werden.","Öffne Family Budget über Telegram, um deine Familie zu verwalten.","Anfrage konnte nicht ausgeführt werden.","Familienbudget einrichten","Prüfe deine Verbindung und öffne die App über Telegram.","Familiengruppe wird erstellt…"],"es":["No se pudo analizar la operación.","Analizar","Guardar cambios","Nuevo sobre","Operación eliminada.","No se pudo eliminar la operación.","Exportar a Excel","Error de exportación","Archivo Excel enviado a Telegram","No se pudo exportar el archivo. Inténtalo de nuevo.","Fondos de pantalla personales","Primero crea un grupo familiar o únete a uno.","No se pudieron cargar las operaciones familiares.","No se pudieron cargar los sobres familiares.","No se pudieron cargar los objetivos de ahorro familiares.","Abre Family Budget desde Telegram para gestionar tu familia.","No se pudo completar la solicitud.","Configuración del presupuesto familiar","Comprueba tu conexión y abre la aplicación desde Telegram.","Creando grupo familiar…"],"fr":["Impossible d’analyser l’opération.","Analyser","Enregistrer les modifications","Nouvelle enveloppe","Opération supprimée.","Impossible de supprimer l’opération.","Exporter vers Excel","Erreur d’exportation","Fichier Excel envoyé sur Telegram","Impossible d’exporter le fichier. Réessaie.","Fonds d’écran personnels","Crée ou rejoins d’abord un groupe familial.","Impossible de charger les opérations familiales.","Impossible de charger les enveloppes familiales.","Impossible de charger les objectifs d’épargne familiaux.","Ouvre Family Budget via Telegram pour gérer ta famille.","Impossible d’exécuter la requête.","Configuration du budget familial","Vérifie ta connexion et ouvre l’application depuis Telegram.","Création du groupe familial…"],"it":["Impossibile analizzare l’operazione.","Analizza","Salva modifiche","Nuova busta","Operazione eliminata.","Impossibile eliminare l’operazione.","Esporta in Excel","Errore di esportazione","File Excel inviato su Telegram","Impossibile esportare il file. Riprova.","Sfondi personalizzati","Crea prima un gruppo famiglia o unisciti a uno.","Impossibile caricare le operazioni familiari.","Impossibile caricare le buste familiari.","Impossibile caricare gli obiettivi di risparmio familiari.","Apri Family Budget tramite Telegram per gestire la tua famiglia.","Impossibile completare la richiesta.","Configurazione del budget familiare","Controlla la connessione e apri l’app da Telegram.","Creazione del gruppo famiglia…"],"pl":["Nie udało się przeanalizować transakcji.","Analizuj","Zapisz zmiany","Nowa koperta","Transakcja usunięta.","Nie udało się usunąć transakcji.","Eksportuj do Excela","Błąd eksportu","Plik Excel wysłano do Telegrama","Nie udało się wyeksportować pliku. Spróbuj ponownie.","Personalne tapety","Najpierw utwórz grupę rodzinną lub do niej dołącz.","Nie udało się załadować transakcji rodzinnych.","Nie udało się załadować kopert rodzinnych.","Nie udało się załadować rodzinnych celów oszczędnościowych.","Otwórz Family Budget przez Telegram, aby zarządzać rodziną.","Nie udało się wykonać żądania.","Konfiguracja budżetu rodzinnego","Sprawdź połączenie i otwórz aplikację z Telegrama.","Tworzenie grupy rodzinnej…"],"tr":["İşlem çözümlenemedi.","Çözümle","Değişiklikleri kaydet","Yeni zarf","İşlem silindi.","İşlem silinemedi.","Excel'e aktar","Dışa aktarma hatası","Excel dosyası Telegram'a gönderildi","Dosya dışa aktarılamadı. Tekrar dene.","Kişisel duvar kâğıtları","Önce bir aile grubu oluştur veya bir gruba katıl.","Aile işlemleri yüklenemedi.","Aile zarfları yüklenemedi.","Aile birikim hedefleri yüklenemedi.","Aileni yönetmek için Family Budget'ı Telegram üzerinden aç.","İstek tamamlanamadı.","Aile bütçesi oluşturuluyor","Bağlantını kontrol et ve uygulamayı Telegram üzerinden aç.","Aile grubu oluşturuluyor…"],"zh":["无法解析交易。","分析","保存更改","新建信封","交易已删除。","无法删除交易。","导出为 Excel","导出错误","Excel 文件已发送至 Telegram","无法导出文件，请重试。","个性化壁纸","请先创建或加入家庭组。","无法加载家庭交易。","无法加载家庭信封。","无法加载家庭储蓄目标。","请通过 Telegram 打开 Family Budget 以管理家庭。","无法完成请求。","创建家庭预算","请检查网络连接，并从 Telegram 打开应用。","正在创建家庭组…"]};

const RUNTIME_TEXT_SOURCES_FIFTH = ["Семья создана! Передай близким код приглашения.","Не удалось создать семью.","Введи код приглашения.","Проверяем код приглашения…","Готово! Ты присоединился к семейной группе.","Не удалось присоединиться к семье.","Код "," скопирован. Отправь его участнику семьи.","Не удалось скопировать автоматически. Код: ","семья","Выйти из группы «","Твои личные записи бюджета, баланс, история, конверты и счета останутся на устройстве. ","Если ты организатор, роль перейдёт другому участнику. Семейные данные не будут удалены.","Выполняем выход из семейной группы…","Ты вышел из семьи. Личные финансовые записи сохранены.","Не удалось выйти из семьи.","Нет данных за прошлый месяц","Пока нет расходов за текущий месяц — добавь операции, и здесь появится анализ.","Пока нет признаков перерасхода. Добавляй операции, чтобы отслеживать бюджет.","Прогноз — ориентир по средним расходам с начала месяца, а не гарантия будущих трат."];
const RUNTIME_TEXT_TRANSLATIONS_FIFTH = {"en":["Family created! Share the invitation code with your loved ones.","Could not create the family.","Enter the invitation code.","Checking invitation code…","Done! You have joined the family group.","Could not join the family.","Code "," copied. Send it to a family member.","Could not copy automatically. Code: ","family","Leave group “","Your personal budget records, balance, history, envelopes and accounts will remain on your device. ","If you are the organizer, the role will pass to another member. Family data will not be deleted.","Leaving the family group…","You left the family. Your personal financial records have been saved.","Could not leave the family.","No data for the previous month","There are no expenses for the current month yet. Add transactions and your analysis will appear here.","No signs of overspending so far. Add transactions to keep track of your budget.","The forecast is based on average spending since the start of the month; it is not a guarantee of future expenses."],"uk":["Сім’ю створено! Передай близьким код запрошення.","Не вдалося створити сім’ю.","Введи код запрошення.","Перевіряємо код запрошення…","Готово! Ти приєднався до сімейної групи.","Не вдалося приєднатися до сім’ї.","Код "," скопійовано. Надішли його учаснику сім’ї.","Не вдалося скопіювати автоматично. Код: ","сім’я","Вийти з групи «","Твої особисті записи бюджету, баланс, історія, конверти та рахунки залишаться на пристрої. ","Якщо ти організатор, роль перейде іншому учаснику. Сімейні дані не буде видалено.","Виходимо із сімейної групи…","Ти вийшов із сім’ї. Особисті фінансові записи збережено.","Не вдалося вийти із сім’ї.","Немає даних за минулий місяць","Поки немає витрат за поточний місяць — додай операції, і тут з’явиться аналіз.","Поки немає ознак перевитрат. Додавай операції, щоб відстежувати бюджет.","Прогноз базується на середніх витратах від початку місяця й не гарантує майбутніх витрат."],"de":["Familie erstellt! Teile den Einladungscode mit deinen Angehörigen.","Familie konnte nicht erstellt werden.","Gib den Einladungscode ein.","Einladungscode wird geprüft…","Fertig! Du bist der Familiengruppe beigetreten.","Beitritt zur Familie fehlgeschlagen.","Code "," kopiert. Sende ihn an ein Familienmitglied.","Automatisches Kopieren fehlgeschlagen. Code: ","Familie","Gruppe verlassen „","Deine persönlichen Budgeteinträge, dein Kontostand, Verlauf, Umschläge und Konten bleiben auf deinem Gerät. ","Wenn du Organisator bist, wird die Rolle an ein anderes Mitglied übertragen. Familiendaten werden nicht gelöscht.","Familiengruppe wird verlassen…","Du hast die Familie verlassen. Deine persönlichen Finanzdaten wurden gespeichert.","Familie konnte nicht verlassen werden.","Keine Daten für den Vormonat","Für den aktuellen Monat liegen noch keine Ausgaben vor. Füge Transaktionen hinzu, damit hier eine Analyse erscheint.","Bisher gibt es keine Anzeichen für Mehrausgaben. Füge Transaktionen hinzu, um dein Budget zu verfolgen.","Die Prognose basiert auf den durchschnittlichen Ausgaben seit Monatsbeginn und ist keine Garantie für zukünftige Ausgaben."],"es":["¡Familia creada! Comparte el código de invitación con tus seres queridos.","No se pudo crear la familia.","Introduce el código de invitación.","Comprobando el código de invitación…","¡Listo! Te has unido al grupo familiar.","No se pudo unir a la familia.","Código "," copiado. Envíalo a un miembro de la familia.","No se pudo copiar automáticamente. Código: ","familia","Salir del grupo «","Tus registros personales, saldo, historial, sobres y cuentas permanecerán en tu dispositivo. ","Si eres el organizador, el rol pasará a otro miembro. Los datos familiares no se eliminarán.","Saliendo del grupo familiar…","Has salido de la familia. Tus registros financieros personales se han guardado.","No se pudo salir de la familia.","No hay datos del mes anterior","Todavía no hay gastos del mes actual. Añade operaciones y aquí aparecerá el análisis.","Por ahora no hay señales de exceso de gasto. Añade operaciones para controlar tu presupuesto.","La previsión se basa en el gasto medio desde el inicio del mes y no garantiza los gastos futuros."],"fr":["Famille créée ! Partage le code d’invitation avec tes proches.","Impossible de créer la famille.","Saisis le code d’invitation.","Vérification du code d’invitation…","C’est fait ! Tu as rejoint le groupe familial.","Impossible de rejoindre la famille.","Code "," copié. Envoie-le à un membre de la famille.","La copie automatique a échoué. Code : ","famille","Quitter le groupe «","Tes données personnelles, ton solde, ton historique, tes enveloppes et tes comptes resteront sur ton appareil. ","Si tu es l’organisateur, le rôle sera transféré à un autre membre. Les données familiales ne seront pas supprimées.","Déconnexion du groupe familial…","Tu as quitté la famille. Tes données financières personnelles ont été conservées.","Impossible de quitter la famille.","Aucune donnée pour le mois précédent","Aucune dépense pour le mois en cours pour le moment. Ajoute des opérations pour afficher une analyse ici.","Aucun signe de dépassement pour le moment. Ajoute des opérations pour suivre ton budget.","La prévision repose sur les dépenses moyennes depuis le début du mois et ne garantit pas les dépenses futures."],"it":["Famiglia creata! Condividi il codice d’invito con i tuoi cari.","Impossibile creare la famiglia.","Inserisci il codice d’invito.","Verifica del codice d’invito…","Fatto! Sei entrato nel gruppo famiglia.","Impossibile unirsi alla famiglia.","Codice "," copiato. Invialo a un membro della famiglia.","Impossibile copiare automaticamente. Codice: ","famiglia","Esci dal gruppo «","Le tue registrazioni personali, il saldo, la cronologia, le buste e i conti resteranno sul dispositivo. ","Se sei l’organizzatore, il ruolo passerà a un altro membro. I dati familiari non verranno eliminati.","Uscita dal gruppo famiglia…","Hai lasciato la famiglia. I tuoi dati finanziari personali sono stati salvati.","Impossibile uscire dalla famiglia.","Nessun dato per il mese scorso","Non ci sono ancora spese per il mese corrente. Aggiungi operazioni e qui apparirà l’analisi.","Al momento non ci sono segnali di spesa eccessiva. Aggiungi operazioni per monitorare il budget.","La previsione si basa sulla spesa media dall’inizio del mese e non garantisce le spese future."],"pl":["Rodzina utworzona! Przekaż bliskim kod zaproszenia.","Nie udało się utworzyć rodziny.","Wpisz kod zaproszenia.","Sprawdzanie kodu zaproszenia…","Gotowe! Dołączono do grupy rodzinnej.","Nie udało się dołączyć do rodziny.","Kod "," skopiowano. Wyślij go członkowi rodziny.","Nie udało się skopiować automatycznie. Kod: ","rodzina","Opuść grupę „","Twoje osobiste wpisy budżetowe, saldo, historia, koperty i konta pozostaną na urządzeniu. ","Jeśli jesteś organizatorem, rola zostanie przekazana innemu członkowi. Dane rodzinne nie zostaną usunięte.","Opuszczanie grupy rodzinnej…","Opuszczono rodzinę. Osobiste dane finansowe zostały zachowane.","Nie udało się opuścić rodziny.","Brak danych za poprzedni miesiąc","W bieżącym miesiącu nie ma jeszcze wydatków. Dodaj transakcje, a pojawi się tutaj analiza.","Na razie nie widać oznak nadmiernych wydatków. Dodawaj transakcje, aby śledzić budżet.","Prognoza opiera się na średnich wydatkach od początku miesiąca i nie gwarantuje przyszłych wydatków."],"tr":["Aile oluşturuldu! Davet kodunu yakınlarınla paylaş.","Aile oluşturulamadı.","Davet kodunu gir.","Davet kodu kontrol ediliyor…","Tamam! Aile grubuna katıldın.","Aileye katılınamadı.","Kod "," kopyalandı. Aile üyesine gönder.","Otomatik kopyalama başarısız. Kod: ","aile","Gruptan ayrıl «","Kişisel bütçe kayıtların, bakiyen, geçmişin, zarfların ve hesapların cihazında kalacak. ","Düzenleyiciysen rol başka bir üyeye aktarılacak. Aile verileri silinmeyecek.","Aile grubundan çıkılıyor…","Aileden ayrıldın. Kişisel finans kayıtların kaydedildi.","Aileden çıkılamadı.","Geçen aya ait veri yok","Bu ay henüz harcama yok. İşlem eklediğinde analiz burada görünecek.","Şimdilik aşırı harcama belirtisi yok. Bütçeni takip etmek için işlemler ekle.","Tahmin, ay başından bu yana ortalama harcamalara dayanır ve gelecekteki harcamaları garanti etmez."],"zh":["家庭已创建！请将邀请码分享给家人。","无法创建家庭。","请输入邀请码。","正在检查邀请码…","完成！你已加入家庭组。","无法加入家庭。","邀请码："," 已复制。请发送给家庭成员。","无法自动复制。邀请码：","家庭","退出群组“","你的个人预算记录、余额、历史、信封和账户将保留在设备上。","如果你是组织者，角色将转交给其他成员。家庭数据不会被删除。","正在退出家庭组…","你已退出家庭。个人财务记录已保存。","无法退出家庭。","上个月没有数据","本月还没有支出。添加交易后，分析结果将在此显示。","目前没有超支迹象。添加交易以持续跟踪预算。","预测根据本月初至今的平均支出计算，并不保证未来的实际支出。"]};

const RUNTIME_TEXT_SOURCES_SIXTH = ["🛑 Лимит исчерпан (100%). Дальнейшие траты превысят бюджет.","🔴 Использовано 90% лимита — осталось ","🟡 Использовано 60% лимита — следи за оставшимся бюджетом.","⚠️ Конверт «","\n\nПотрачено: ","Удалить конверт «","Удалить копилку «","🎉 Цель достигнута!\n\nКопилка «","» собрала ","Расходы выросли на ","Расходы снизились на ","% к прошлому месяцу","Расходы за месяц превышают доходы на ","Конверт «","»: превышение лимита на ","Доходы за месяц","В среднем в день","Изменить чек","Удалить чек","Создать","Изменить","Удалить","＋ Пополнить"];
const RUNTIME_TEXT_TRANSLATIONS_SIXTH = {"en":["🛑 Limit reached (100%). Further spending will exceed your budget.","🔴 90% of the limit used — remaining ","🟡 60% of the limit used — keep an eye on your remaining budget.","⚠️ Envelope “","\n\nSpent: ","Delete envelope “","Delete savings goal “","🎉 Goal reached!\n\nSavings goal “","” has collected ","Spending increased by ","Spending decreased by ","% compared with last month","Monthly expenses exceed income by ","Envelope “","”: limit exceeded by ","Income this month","Average per day","Edit receipt","Delete receipt","Create","Edit","Delete","＋ Add funds"],"uk":["🛑 Ліміт вичерпано (100%). Подальші витрати перевищать бюджет.","🔴 Використано 90% ліміту — залишилося ","🟡 Використано 60% ліміту — стеж за залишком бюджету.","⚠️ Конверт «","\n\nВитрачено: ","Видалити конверт «","Видалити скарбничку «","🎉 Ціль досягнуто!\n\nСкарбничка «","» зібрала ","Витрати зросли на ","Витрати зменшилися на ","% порівняно з минулим місяцем","Витрати за місяць перевищують доходи на ","Конверт «","»: перевищення ліміту на ","Доходи за місяць","У середньому за день","Змінити чек","Видалити чек","Створити","Змінити","Видалити","＋ Поповнити"],"de":["🛑 Limit erreicht (100 %). Weitere Ausgaben überschreiten dein Budget.","🔴 90 % des Limits verbraucht — verbleibend ","🟡 60 % des Limits verbraucht — behalte dein Restbudget im Blick.","⚠️ Umschlag „","\n\nAusgegeben: ","Umschlag löschen „","Sparziel löschen „","🎉 Ziel erreicht!\n\nSparziel „","” hat gesammelt: ","Ausgaben stiegen um ","Ausgaben sanken um ","% im Vergleich zum Vormonat","Die monatlichen Ausgaben übersteigen die Einnahmen um ","Umschlag „","”: Limit überschritten um ","Einnahmen im Monat","Durchschnitt pro Tag","Beleg bearbeiten","Beleg löschen","Erstellen","Bearbeiten","Löschen","＋ Einzahlen"],"es":["🛑 Límite agotado (100 %). Los gastos adicionales superarán tu presupuesto.","🔴 Se ha utilizado el 90 % del límite; queda ","🟡 Se ha utilizado el 60 % del límite; vigila el presupuesto restante.","⚠️ Sobre «","\n\nGastado: ","Eliminar sobre «","Eliminar objetivo de ahorro «","🎉 ¡Objetivo alcanzado!\n\nEl objetivo «","» ha reunido ","Los gastos aumentaron un ","Los gastos disminuyeron un ","% respecto al mes anterior","Los gastos del mes superan los ingresos en ","Sobre «","»: límite superado en ","Ingresos del mes","Promedio diario","Editar recibo","Eliminar recibo","Crear","Editar","Eliminar","＋ Añadir fondos"],"fr":["🛑 Limite atteint (100 %). Les dépenses supplémentaires dépasseront ton budget.","🔴 90 % de la limite utilisés — reste ","🟡 60 % de la limite utilisés — surveille le budget restant.","⚠️ Enveloppe «","\n\nDépensé : ","Supprimer l’enveloppe «","Supprimer l’objectif d’épargne «","🎉 Objectif atteint !\n\nL’objectif «","» a accumulé ","Les dépenses ont augmenté de ","Les dépenses ont diminué de ","% par rapport au mois dernier","Les dépenses du mois dépassent les revenus de ","Enveloppe «","» : dépassement de la limite de ","Revenus du mois","Moyenne par jour","Modifier le reçu","Supprimer le reçu","Créer","Modifier","Supprimer","＋ Ajouter des fonds"],"it":["🛑 Limite raggiunto (100%). Le spese successive supereranno il budget.","🔴 Utilizzato il 90% del limite — resta ","🟡 Utilizzato il 60% del limite — controlla il budget rimanente.","⚠️ Busta «","\n\nSpeso: ","Elimina busta «","Elimina obiettivo di risparmio «","🎉 Obiettivo raggiunto!\n\nL’obiettivo «","» ha raccolto ","Le spese sono aumentate del ","Le spese sono diminuite del ","% rispetto al mese scorso","Le spese del mese superano le entrate di ","Busta «","»: limite superato di ","Entrate del mese","Media giornaliera","Modifica ricevuta","Elimina ricevuta","Crea","Modifica","Elimina","＋ Aggiungi fondi"],"pl":["🛑 Limit wyczerpany (100%). Dalsze wydatki przekroczą budżet.","🔴 Wykorzystano 90% limitu — pozostało ","🟡 Wykorzystano 60% limitu — kontroluj pozostały budżet.","⚠️ Koperta „","\n\nWydano: ","Usuń kopertę „","Usuń cel oszczędnościowy „","🎉 Cel osiągnięty!\n\nCel „","” zgromadził ","Wydatki wzrosły o ","Wydatki spadły o ","% w porównaniu z poprzednim miesiącem","Miesięczne wydatki przekraczają przychody o ","Koperta „","”: przekroczenie limitu o ","Przychody w miesiącu","Średnio dziennie","Edytuj paragon","Usuń paragon","Utwórz","Edytuj","Usuń","＋ Dodaj środki"],"tr":["🛑 Limit doldu (%100). Sonraki harcamalar bütçeni aşacak.","🔴 Limitin %90'ı kullanıldı — kalan ","🟡 Limitin %60'ı kullanıldı — kalan bütçeni takip et.","⚠️ Zarf “","\n\nHarcanan: ","Zarfı sil “","Birikim hedefini sil “","🎉 Hedefe ulaşıldı!\n\nBirikim hedefi “","” şu kadar biriktirdi: ","Harcamalar şu kadar arttı: ","Harcamalar şu kadar azaldı: ","% geçen aya göre","Aylık harcamalar geliri şu kadar aşıyor: ","Zarf “","”: limit şu kadar aşıldı: ","Aylık gelir","Günlük ortalama","Fişi düzenle","Fişi sil","Oluştur","Düzenle","Sil","＋ Para ekle"],"zh":["🛑 已达到限额（100%）。继续支出将超出预算。","🔴 已使用 90% 限额 — 剩余 ","🟡 已使用 60% 限额 — 请留意剩余预算。","⚠️ 信封“","\n\n已支出：","删除信封“","删除储蓄目标“","🎉 目标已达成！\n\n储蓄目标“","”已累计 ","支出增加了 ","支出减少了 ","%（与上月相比）","本月支出超出收入 ","信封“","”：超出限额 ","本月收入","日均","编辑收据","删除收据","创建","编辑","删除","＋ 添加资金"]};

const RUNTIME_TEXT_SOURCES_SEVENTH = ["Конверт","Операция","Не удалось синхронизировать напоминания об автоплатежах:"," из ",". Нажми «Сохранить» только после проверки.","Контроль бюджета","Финансовая картина","На основе операций текущего и прошлого месяца","Прогноз расходов","к концу месяца","Свои категории"];
const RUNTIME_TEXT_TRANSLATIONS_SEVENTH = {"en":["Envelope","Transaction","Could not sync automatic payment reminders:"," of ",". Click Save only after reviewing.","Budget control","Financial overview","Based on transactions from this and the previous month","Spending forecast","by the end of the month","Custom categories"],"uk":["Конверт","Операція","Не вдалося синхронізувати нагадування про автоплатежі:"," із ",". Натисни «Зберегти» лише після перевірки.","Контроль бюджету","Фінансова картина","На основі операцій поточного та минулого місяця","Прогноз витрат","до кінця місяця","Власні категорії"],"de":["Umschlag","Transaktion","Automatische Zahlungserinnerungen konnten nicht synchronisiert werden:"," von ",". Klicke erst nach der Prüfung auf „Speichern“.","Budgetkontrolle","Finanzübersicht","Basierend auf Transaktionen dieses und des letzten Monats","Ausgabenprognose","bis zum Monatsende","Eigene Kategorien"],"es":["Sobre","Operación","No se pudieron sincronizar los recordatorios de pagos automáticos:"," de ",". Pulsa Guardar solo después de revisar.","Control del presupuesto","Resumen financiero","Basado en las operaciones de este mes y del anterior","Previsión de gastos","hasta fin de mes","Categorías personalizadas"],"fr":["Enveloppe","Opération","Impossible de synchroniser les rappels de paiements automatiques :"," sur ",". Clique sur Enregistrer uniquement après vérification.","Contrôle du budget","Aperçu financier","Basé sur les opérations du mois actuel et du mois précédent","Prévision des dépenses","d’ici la fin du mois","Catégories personnalisées"],"it":["Busta","Operazione","Impossibile sincronizzare i promemoria dei pagamenti automatici:"," di ",". Premi Salva solo dopo aver controllato.","Controllo del budget","Quadro finanziario","Basato sulle operazioni del mese corrente e precedente","Previsione delle spese","entro la fine del mese","Categorie personalizzate"],"pl":["Koperta","Transakcja","Nie udało się zsynchronizować przypomnień o płatnościach automatycznych:"," z ",". Kliknij Zapisz dopiero po sprawdzeniu.","Kontrola budżetu","Obraz finansów","Na podstawie transakcji z bieżącego i poprzedniego miesiąca","Prognoza wydatków","do końca miesiąca","Własne kategorie"],"tr":["Zarf","İşlem","Otomatik ödeme hatırlatıcıları eşitlenemedi:"," içinden ",". Kontrol ettikten sonra Kaydet'e bas.","Bütçe kontrolü","Finansal görünüm","Bu ayın ve geçen ayın işlemlerine göre","Harcama tahmini","ayın sonuna kadar","Özel kategoriler"],"zh":["信封","交易","无法同步自动付款提醒："," 中的 ",". 检查后再点击“保存”。","预算管理","财务概览","根据本月和上月的交易记录","支出预测","到月底","自定义分类"]};

const RUNTIME_TEXT_SOURCES_EIGHTH = ["Как работают купоны","Выбор купона","Что входит в Basic","Преимущества Basic","Что входит в PRO","Дополнительные возможности PRO","Режим бюджета","Вопрос финансовому помощнику","Загружаем ссылку…","Например: потратил 350 грн на продукты","Например, АТБ","Молоко; 42.50; 1\nХлеб; 28; 2\nЯблоки; 35; 1.5","Сумма чека","Эмодзи","Лимит","Сумма пополнения","Например, аренда или интернет"];
const RUNTIME_TEXT_TRANSLATIONS_EIGHTH = {"en":["How coupons work","Choose a coupon","What's included in Basic","Basic benefits","What's included in PRO","Additional PRO features","Budget mode","Question for the financial assistant","Loading link…","For example: spent 350 UAH on groceries","For example, ATB","Milk; 42.50; 1\nBread; 28; 2\nApples; 35; 1.5","Receipt total","Emoji","Limit","Top-up amount","For example, rent or internet"],"uk":["Як працюють купони","Вибір купона","Що входить до Basic","Переваги Basic","Що входить до PRO","Додаткові можливості PRO","Режим бюджету","Запитання фінансовому помічнику","Завантажуємо посилання…","Наприклад: витратив 350 грн на продукти","Наприклад, АТБ","Молоко; 42.50; 1\nХліб; 28; 2\nЯблука; 35; 1.5","Сума чека","Емодзі","Ліміт","Сума поповнення","Наприклад, оренда або інтернет"],"de":["So funktionieren Gutscheine","Gutschein auswählen","Was Basic beinhaltet","Vorteile von Basic","Was PRO beinhaltet","Zusätzliche PRO-Funktionen","Budgetmodus","Frage an den Finanzassistenten","Link wird geladen…","Zum Beispiel: 350 UAH für Lebensmittel ausgegeben","Zum Beispiel ATB","Milch; 42.50; 1\nBrot; 28; 2\nÄpfel; 35; 1.5","Kassenbonbetrag","Emoji","Limit","Aufladebetrag","Zum Beispiel Miete oder Internet"],"es":["Cómo funcionan los cupones","Elegir un cupón","Qué incluye Basic","Ventajas de Basic","Qué incluye PRO","Funciones adicionales de PRO","Modo de presupuesto","Pregunta al asistente financiero","Cargando enlace…","Por ejemplo: gasté 350 UAH en comida","Por ejemplo, ATB","Leche; 42.50; 1\nPan; 28; 2\nManzanas; 35; 1.5","Total del recibo","Emoji","Límite","Importe de recarga","Por ejemplo, alquiler o internet"],"fr":["Comment fonctionnent les coupons","Choisir un coupon","Contenu de Basic","Avantages de Basic","Contenu de PRO","Fonctionnalités PRO supplémentaires","Mode budget","Question à l’assistant financier","Chargement du lien…","Par exemple : 350 UAH dépensés en courses","Par exemple, ATB","Lait ; 42.50 ; 1\nPain ; 28 ; 2\nPommes ; 35 ; 1.5","Montant du ticket","Emoji","Limite","Montant du versement","Par exemple, loyer ou Internet"],"it":["Come funzionano i coupon","Scegli un coupon","Cosa include Basic","Vantaggi di Basic","Cosa include PRO","Funzioni PRO aggiuntive","Modalità budget","Domanda all’assistente finanziario","Caricamento link…","Ad esempio: ho speso 350 UAH per la spesa","Ad esempio, ATB","Latte; 42.50; 1\nPane; 28; 2\nMele; 35; 1.5","Totale dello scontrino","Emoji","Limite","Importo della ricarica","Ad esempio, affitto o internet"],"pl":["Jak działają kupony","Wybierz kupon","Co zawiera Basic","Zalety Basic","Co zawiera PRO","Dodatkowe funkcje PRO","Tryb budżetu","Pytanie do asystenta finansowego","Ładowanie linku…","Na przykład: wydano 350 UAH na zakupy","Na przykład ATB","Mleko; 42.50; 1\nChleb; 28; 2\nJabłka; 35; 1.5","Kwota paragonu","Emoji","Limit","Kwota doładowania","Na przykład czynsz lub internet"],"tr":["Kuponlar nasıl çalışır","Kupon seç","Basic neleri içerir","Basic avantajları","PRO neleri içerir","Ek PRO özellikleri","Bütçe modu","Finans asistanına soru","Bağlantı yükleniyor…","Örneğin: market için 350 UAH harcadım","Örneğin, ATB","Süt; 42.50; 1\nEkmek; 28; 2\nElma; 35; 1.5","Fiş tutarı","Emoji","Limit","Yükleme tutarı","Örneğin kira veya internet"],"zh":["优惠券使用说明","选择优惠券","Basic 包含的内容","Basic 优势","PRO 包含的内容","PRO 额外功能","预算模式","向财务助手提问","正在加载链接…","例如：买菜花了 350 UAH","例如：ATB","牛奶；42.50；1\n面包；28；2\n苹果；35；1.5","收据金额","表情符号","限额","充值金额","例如：房租或网络费"]};

const STATIC_EXTRA_LABELS_I18N = {
  ru: {'Семейный Бюджет':'Семейный бюджет','FREE':'БЕСПЛАТНО','START':'СТАРТ','3 MO':'3 мес.','6 MO':'6 мес.','1 MONTH':'1 месяц','/ год':'/ год','Загрузка…':'Загрузка…'},
  uk: {'Семейный Бюджет':'Сімейний бюджет','FREE':'БЕЗКОШТОВНО','START':'СТАРТ','3 MO':'3 міс.','6 MO':'6 міс.','1 MONTH':'1 місяць','/ год':'/ рік','Загрузка…':'Завантаження…'},
  en: {'Семейный Бюджет':'Family Budget','FREE':'FREE','START':'START','3 MO':'3 mo.','6 MO':'6 mo.','1 MONTH':'1 month','/ год':'/ year','Загрузка…':'Loading…'},
  de: {'Семейный Бюджет':'Family Budget','FREE':'KOSTENLOS','START':'START','3 MO':'3 Mon.','6 MO':'6 Mon.','1 MONTH':'1 Monat','/ год':'/ Jahr','Загрузка…':'Wird geladen…'},
  es: {'Семейный Бюджет':'Family Budget','FREE':'GRATIS','START':'INICIO','3 MO':'3 meses','6 MO':'6 meses','1 MONTH':'1 mes','/ год':'/ año','Загрузка…':'Cargando…'},
  fr: {'Семейный Бюджет':'Family Budget','FREE':'GRATUIT','START':'DÉBUT','3 MO':'3 mois','6 MO':'6 mois','1 MONTH':'1 mois','/ год':'/ an','Загрузка…':'Chargement…'},
  it: {'Семейный Бюджет':'Family Budget','FREE':'GRATIS','START':'INIZIO','3 MO':'3 mesi','6 MO':'6 mesi','1 MONTH':'1 mese','/ год':'/ anno','Загрузка…':'Caricamento…'},
  pl: {'Семейный Бюджет':'Family Budget','FREE':'BEZPŁATNIE','START':'START','3 MO':'3 mies.','6 MO':'6 mies.','1 MONTH':'1 miesiąc','/ год':'/ rok','Загрузка…':'Ładowanie…'},
  tr: {'Семейный Бюджет':'Family Budget','FREE':'ÜCRETSİZ','START':'BAŞLANGIÇ','3 MO':'3 ay','6 MO':'6 ay','1 MONTH':'1 ay','/ год':'/ yıl','Загрузка…':'Yükleniyor…'},
  zh: {'Семейный Бюджет':'Family Budget','FREE':'免费','START':'开始','3 MO':'3个月','6 MO':'6个月','1 MONTH':'1个月','/ год':'/年','Загрузка…':'加载中…'}
};
for (const [lang, labels] of Object.entries(STATIC_EXTRA_LABELS_I18N)) {
  if (STATIC_UI_TRANSLATIONS[lang]) Object.assign(STATIC_UI_TRANSLATIONS[lang], labels);
}

let _autoTextMapCache = null;
let _autoTextPatternCache = null;
function _normalizeAutoText(value){
  return String(value ?? '').replace(/[\u00a0\u202f\u2007]/g,' ').replace(/\s+/g,' ').trim();
}
function _addAutoTextEntry(map, patterns, source, target, aliases=[]){
  const addPattern=(template)=>{
    const tokens=[...template.matchAll(/\{[^{}]+\}/g)];
    if(!tokens.length)return false;
    let cursor=0, expression='^';
    const escapeRegex=value=>value.replace(/[|\\{}()[\]^$+*?.]/g,'\\$&');
    for(const token of tokens){
      expression+=escapeRegex(template.slice(cursor,token.index))+'(.*?)';
      cursor=token.index+token[0].length;
    }
    expression+=escapeRegex(template.slice(cursor))+'$';
    try{patterns.push({regex:new RegExp(expression),target:String(target),tokenCount:tokens.length,length:template.length});return true;}catch(_){return false;}
  };
  const normalizedSource=_normalizeAutoText(source);
  if(!normalizedSource || !target) return;
  if(normalizedSource.includes('{') && normalizedSource.includes('}')) addPattern(normalizedSource);
  else map[normalizedSource]=String(target);
  for(const alias of aliases){
    const normalizedAlias=_normalizeAutoText(alias);
    if(!normalizedAlias)continue;
    if(normalizedAlias.includes('{') && normalizedAlias.includes('}')) addPattern(normalizedAlias);
    else map[normalizedAlias]=String(target);
  }
}
function _autoTextMap(){
  const activeLang=String(appData?.lang||'ru').toLowerCase().split('-')[0];
  if(_autoTextMapCache && _autoTextMapCache.lang===activeLang) return _autoTextMapCache.map;
  const map=Object.create(null), patterns=[];
  const addDictionaries=(ru, all, keyIsSource=false)=>{
    if(!ru || !all) return;
    for(const [key,sourceValue] of Object.entries(ru)){
      const source=String(keyIsSource?key:sourceValue);
      const target=String((all[activeLang] && all[activeLang][key]) ?? (keyIsSource?key:sourceValue));
      const aliases=Object.values(all).map(dict=>dict && dict[key]).filter(value=>typeof value==='string');
      _addAutoTextEntry(map,patterns,source,target,aliases);
    }
  };
  addDictionaries(EXTRA_UI_TRANSLATIONS.ru,EXTRA_UI_TRANSLATIONS,false);
  addDictionaries(EXTRA_TRANSLATIONS.ru,EXTRA_TRANSLATIONS,true);
  addDictionaries(AUDIT_TRANSLATIONS.ru,AUDIT_TRANSLATIONS,true);
  const staticAll=STATIC_UI_TRANSLATIONS||{};
  for(const [source,target] of Object.entries(staticAll[activeLang]||staticAll.ru||{})){
    const aliases=Object.values(staticAll).map(dict=>dict && dict[source]).filter(value=>typeof value==='string');
    _addAutoTextEntry(map,patterns,source,target,aliases);
  }
  const runtimeGroups=[
    [RUNTIME_TEXT_SOURCES,RUNTIME_TEXT_TRANSLATIONS],
    [RUNTIME_TEXT_SOURCES_EXTRA,RUNTIME_TEXT_TRANSLATIONS_EXTRA],
    [RUNTIME_TEXT_SOURCES_FOURTH,RUNTIME_TEXT_TRANSLATIONS_FOURTH],
    [RUNTIME_TEXT_SOURCES_FIFTH,RUNTIME_TEXT_TRANSLATIONS_FIFTH],
    [RUNTIME_TEXT_SOURCES_SIXTH,RUNTIME_TEXT_TRANSLATIONS_SIXTH],
    [RUNTIME_TEXT_SOURCES_SEVENTH,RUNTIME_TEXT_TRANSLATIONS_SEVENTH],
    [RUNTIME_TEXT_SOURCES_EIGHTH,RUNTIME_TEXT_TRANSLATIONS_EIGHTH]
  ];
  for(const [sources,translations] of runtimeGroups){
    for(let i=0;i<sources.length;i++){
      const target=(translations[activeLang]||[])[i]||sources[i];
      const aliases=Object.values(translations).map(values=>values && values[i]).filter(value=>typeof value==='string');
      _addAutoTextEntry(map,patterns,sources[i],target,aliases);
    }
  }
  if(typeof CAT_I18N!=='undefined'){
    for(const [source,langs] of Object.entries(CAT_I18N)){
      const target=langs[activeLang]||source;
      _addAutoTextEntry(map,patterns,source,target,Object.values(langs));
    }
  }
  const aliases={
    'Русский':'Русский','Українська':'Українська','English':'English','Deutsch':'Deutsch','Español':'Español','Français':'Français','Italiano':'Italiano','Polski':'Polski','Türkçe':'Türkçe','中文':'中文',
    'Личный баланс':'Личный баланс','Общий баланс семьи':'Общий баланс семьи'
  };
  Object.assign(map,aliases);
  addDictionaries(TRANSLATIONS.ru,TRANSLATIONS,false);
  patterns.sort((a,b)=>b.length-a.length);
  _autoTextPatternCache={lang:activeLang,patterns};
  _autoTextMapCache={lang:activeLang,map};
  return map;
}
function _translateAutoText(value){
  const normalized=_normalizeAutoText(value);
  if(!normalized)return null;
  const map=_autoTextMap();
  if(Object.prototype.hasOwnProperty.call(map,normalized))return map[normalized];
  const activeLang=String(appData?.lang||'ru').toLowerCase().split('-')[0];
  if(!_autoTextPatternCache || _autoTextPatternCache.lang!==activeLang) _autoTextMap();
  for(const item of (_autoTextPatternCache?.patterns||[])){
    const match=normalized.match(item.regex);
    if(!match)continue;
    let index=1;
    return item.target.replace(/\{[^{}]+\}/g,()=>match[index++] ?? '');
  }
  return null;
}
function _localizeDialogMessage(message){
  const source=String(message ?? '');
  return _translateAutoText(source) || source;
}
const _familyBudgetNativeAlert = window.alert.bind(window);
const _familyBudgetNativeConfirm = window.confirm.bind(window);
window.alert = function(message){ return _familyBudgetNativeAlert(_localizeDialogMessage(message)); };
window.confirm = function(message){ return _familyBudgetNativeConfirm(_localizeDialogMessage(message)); };

function _translateHardcodedNode(node){
  if(!node || node.nodeType !== 3) return;
  const parent=node.parentElement;
  if(!parent || parent.closest('[data-i18n]')) return;
  if(['SCRIPT','STYLE','TEXTAREA','CODE','PRE'].includes(parent.tagName)) return;
  let record=_autoTextOriginals.get(node);
  if(!record){ record={source:node.nodeValue,last:null}; _autoTextOriginals.set(node,record); }
  else if(record.last!==null && node.nodeValue!==record.last){ record.source=node.nodeValue; record.last=null; }
  const source=record.source;
  const trimmed=source.trim();
  if(!trimmed || trimmed.length>1200) return;
  const translated=_translateAutoText(trimmed);
  if(translated){
    const start=source.indexOf(trimmed), end=start+trimmed.length;
    const next=source.slice(0,start)+translated+source.slice(end);
    if(node.nodeValue!==next) node.nodeValue=next;
    record.last=next;
  } else {
    if(String(appData?.lang||'ru').toLowerCase().split('-')[0]==='ru' && node.nodeValue!==source) node.nodeValue=source;
    record.last=null;
  }
}
function _translateHardcodedAttributes(el){
  if(!el || el.nodeType!==1) return;
  const map=_autoTextMap();
  for(const attr of AUTO_TRANSLATABLE_ATTRIBUTES){
    if(!el.hasAttribute(attr)) continue;
    if(attr==='placeholder' && el.hasAttribute('data-i18n-placeholder')) continue;
    if(attr==='value' && el.hasAttribute('data-i18n')) continue;
    let originals=_autoAttributeOriginals.get(el);
    if(!originals){ originals=Object.create(null); _autoAttributeOriginals.set(el,originals); }
    let record=originals[attr];
    if(!record){ record={source:el.getAttribute(attr),last:null}; originals[attr]=record; }
    else if(record.last!==null && el.getAttribute(attr)!==record.last){ record.source=el.getAttribute(attr); record.last=null; }
    const source=record.source, translated=_translateAutoText(source);
    if(translated){
      if(el.getAttribute(attr)!==translated) el.setAttribute(attr,translated);
      record.last=translated;
    } else {
      if(String(appData?.lang||'ru').toLowerCase().split('-')[0]==='ru' && el.getAttribute(attr)!==source) el.setAttribute(attr,source);
      record.last=null;
    }
  }
}
function translateHardcodedText(root=document.body){
  if(!root)return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode())) _translateHardcodedNode(node);
  if(root.nodeType===1) _translateHardcodedAttributes(root);
  root.querySelectorAll?.('*').forEach(_translateHardcodedAttributes);
}
function startHardcodedTextTranslation(){
  translateHardcodedText();
  if(_autoTextObserver)return;
  _autoTextObserver=new MutationObserver(records=>{
    for(const record of records){
      if(record.type==='characterData') _translateHardcodedNode(record.target);
      if(record.type==='attributes') _translateHardcodedAttributes(record.target);
      for(const added of record.addedNodes||[]){
        if(added.nodeType===3) _translateHardcodedNode(added);
        else if(added.nodeType===1) translateHardcodedText(added);
      }
    }
  });
  _autoTextObserver.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:AUTO_TRANSLATABLE_ATTRIBUTES});
}
function applyLang(){
  document.documentElement.lang = String(appData?.lang || 'ru').toLowerCase().split('-')[0];
  _autoTextMapCache = null;
  _autoTextPatternCache = null;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  const languageLabel=document.getElementById('langLabel');
  if(languageLabel) languageLabel.innerText = (LANGS.find(l=>l.id===appData.lang)||LANGS[0]).flag + ' ' + (LANGS.find(l=>l.id===appData.lang)||LANGS[0]).label;
  const selectedCurrency = CURRENCIES.find(c=>c.id===appData.currency)||CURRENCIES[0];
  const currencyLabel=document.getElementById('currLabel');
  if(currencyLabel) currencyLabel.innerText = selectedCurrency.sym + ' ' + tCurrency(selectedCurrency.id);
  applyReceiptFormTranslations();
  translateHardcodedText();
  startHardcodedTextTranslation();
}

function switchTab(name){
  document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  const tab = document.getElementById('tab-' + name);
  if(!tab) return;
  tab.style.display = 'block';
  const nav = document.getElementById('nav-' + name);
  if(nav) nav.classList.add('active');
  if(name === 'analytics') renderCharts();
  renderAll();
}

function openModal(id){ document.getElementById(id).classList.add('active'); }
function closeModal(id){ document.getElementById(id).classList.remove('active'); }
function openHelp(topic='general'){
  const title = document.getElementById('helpModalTitle');
  const body = document.getElementById('helpModalBody');
  if(!title || !body){ openModal('modalHelp'); return; }
  const content = {
    general: {
      title: 'Как пользоваться приложением «Семейный бюджет»',
      html: '<p>«Семейный бюджет» помогает вести личный бюджет прямо внутри Telegram — без необходимости переключаться между отдельными приложениями.</p><ul><li><b>Доходы и расходы:</b> записывай операции и смотри историю.</li><li><b>Планирование:</b> используй конверты, счета и финансовые цели.</li><li><b>Аналитика:</b> отслеживай структуру трат и сравнивай результаты.</li><li><b>Настройки:</b> выбирай валюту, язык и оформление.</li><li><b>PRO:</b> открывает собственные категории, персональные обои, Excel-отчёты и ежедневные напоминания.</li></ul><p class="help-note">Совет: записывай расходы сразу после покупки — так статистика будет точнее.</p>'
    },
    advantages: {
      title: 'help_adv_title',
      html: '<ul><li><b>' + t('help_adv_telegram') + ':</b> ' + t('help_adv_telegram_desc') + '</li><li><b>' + t('help_adv_all') + ':</b> ' + t('help_adv_all_desc') + '</li><li><b>' + t('help_adv_flex') + ':</b> ' + t('help_adv_flex_desc') + '</li><li><b>' + t('help_adv_pro') + ':</b> ' + t('help_adv_pro_desc') + '</li><li><b>' + t('help_adv_trial') + ':</b> ' + t('help_adv_trial_desc') + '</li><li><b>' + t('help_adv_bonus') + ':</b> ' + t('help_adv_bonus_desc') + '</li><li><b>' + t('help_adv_payment') + ':</b> ' + t('help_adv_payment_desc') + '</li></ul><p class="help-note">' + t('help_adv_note') + '</p>'
    },
    plans: {
      title: 'Как выбрать тариф',
      html: '<p><b>Basic</b> — личный бюджет: доходы и расходы, история, категории, конверты, накопительные цели, аналитика, регулярные платежи и ручной ввод чеков.</p><p><b>PRO</b> включает всё из Basic, текстовое добавление доходов и расходов через приложение и чат бота, собственные категории, персональные обои, Excel-отчёты в Telegram, расширенную аналитику, семейный бюджет до 6 участников, напоминания и 30 ИИ-запросов в месяц.</p><p>Перед оплатой проверь срок и цену выбранного тарифа.</p><p class="help-note">Новым пользователям доступно 30 дней пробного периода.</p>'
    },
    basic: {
      title: 'Что входит в Basic',
      html: '<ul><li>Запись доходов и расходов.</li><li>История операций и категории.</li><li>Конверты, накопительные счета и финансовые цели.</li><li>Аналитика и прогноз расходов.</li><li>Планирование регулярных платежей.</li><li>Ручной ввод чеков и товаров.</li></ul><p>Basic — для ежедневного личного бюджета без лишних сложностей.</p>'
    },
    pro: {
      title: 'Что даёт PRO',
      html: '<ul><li><b>Всё из Basic.</b></li><li><b>Добавление операций текстом:</b> описывай доходы и расходы в приложении или чате бота, например «кофе 120» или «зарплата 25000».</li><li><b>Свои категории:</b> создавай категории доходов и расходов под себя.</li><li><b>Персональные обои:</b> настрой оформление интерфейса.</li><li><b>Экспорт Excel:</b> отправляй финансовый отчёт в Telegram.</li><li><b>Расширенная аналитика:</b> сравнение месяцев, топ категорий и прогноз расходов.</li><li><b>Семейный бюджет:</b> общий учёт до 6 участников.</li><li><b>Ежедневные напоминания</b> и 30 ИИ-запросов в месяц.</li></ul><p>PRO — для тех, кто хочет автоматизировать учёт, вести общий семейный бюджет и глубже анализировать финансы.</p>'
    },
    coupons: {
      title: 'Как работают купоны',
      html: '<ul><li><b>Купон 10%:</b> начисляется за приглашение нового пользователя, а также по одному за каждую подтверждённую оплату его подписки.</li><li><b>Купон 20%:</b> начисляется за принятый отзыв.</li><li><b>Один купон — одна покупка:</b> выбери купон до оплаты.</li><li><b>Без риска потери:</b> купон списывается только после подтверждения успешной оплаты.</li></ul><p class="help-note">Повторные уведомления об одной и той же оплате не должны создавать дополнительные бонусы.</p>'
    }
  };
  const selected = content[topic] || content.general;
  title.textContent = selected.title === 'help_adv_title' ? t(selected.title) : t(selected.title);
  body.innerHTML = selected.html;
  translateHardcodedText(body);
  openModal('modalHelp');
}

function requestProFeature(feature){
  const localizedFeature = _localizeDialogMessage(feature);
  const message = t('pro_feature_message').replace('{feature}',localizedFeature);
  const tg = window.Telegram?.WebApp;
  const goToPay = () => { window.location.href = '?screen=pay'; };
  if(tg?.initData && tg.showAlert){
    tg.showAlert(_localizeDialogMessage(message), goToPay);
  } else {
    alert(message);
    goToPay();
  }
}

let pendingReceiptDraft = null;
let receiptEditingTxId = null;
let editingEnvelopeId = null;
let editingBankId = null;

const RECEIPT_FORM_I18N = {
ru:{title:'Чек из магазина',hint:'Basic: внеси данные чека вручную. Каждая строка товара — название; цена; количество.',store:'Магазин',storePh:'Например, АТБ',date:'Дата покупки',items:'Товары',itemsPh:'Молоко; 42.50; 1\nХлеб; 28; 2\nЯблоки; 35; 1.5',total:'Итого по чеку',totalPh:'Сумма чека',manual:'Ввести чек вручную',photo:'Чек по фото',aiCount:'1 ИИ-запрос'},
uk:{title:'Чек із магазину',hint:'Basic: внеси дані чека вручну. Кожен рядок товару — назва; ціна; кількість.',store:'Магазин',storePh:'Наприклад, АТБ',date:'Дата покупки',items:'Товари',itemsPh:'Молоко; 42.50; 1\nХліб; 28; 2\nЯблука; 35; 1.5',total:'Разом за чеком',totalPh:'Сума чека',manual:'Ввести чек вручну',photo:'Чек за фото',aiCount:'1 запит ШІ'},
en:{title:'Store receipt',hint:'Basic: enter receipt details manually. Each item line: name; price; quantity.',store:'Store',storePh:'For example, Walmart',date:'Purchase date',items:'Items',itemsPh:'Milk; 1.50; 1\nBread; 2.00; 2\nApples; 3.50; 1.5',total:'Receipt total',totalPh:'Receipt amount',manual:'Enter receipt manually',photo:'Scan receipt photo',aiCount:'1 AI request'},
de:{title:'Kassenbon',hint:'Basic: Gib die Belegdaten manuell ein. Jede Artikelzeile: Name; Preis; Menge.',store:'Geschäft',storePh:'Zum Beispiel Aldi',date:'Kaufdatum',items:'Artikel',itemsPh:'Milch; 1,50; 1\nBrot; 2,00; 2\nÄpfel; 3,50; 1,5',total:'Belegsumme',totalPh:'Betrag des Belegs',manual:'Beleg manuell eingeben',photo:'Beleg per Foto scannen',aiCount:'1 KI-Anfrage'},
es:{title:'Recibo de compra',hint:'Basic: introduce los datos del recibo manualmente. Cada línea: nombre; precio; cantidad.',store:'Tienda',storePh:'Por ejemplo, Carrefour',date:'Fecha de compra',items:'Productos',itemsPh:'Leche; 1,50; 1\nPan; 2,00; 2\nManzanas; 3,50; 1,5',total:'Total del recibo',totalPh:'Importe del recibo',manual:'Introducir recibo manualmente',photo:'Escanear recibo con foto',aiCount:'1 solicitud de IA'},
fr:{title:'Ticket de caisse',hint:'Basic : saisis les données du ticket manuellement. Une ligne par article : nom ; prix ; quantité.',store:'Magasin',storePh:'Par exemple, Carrefour',date:'Date d’achat',items:'Articles',itemsPh:'Lait ; 1,50 ; 1\nPain ; 2,00 ; 2\nPommes ; 3,50 ; 1,5',total:'Total du ticket',totalPh:'Montant du ticket',manual:'Saisir le ticket manuellement',photo:'Scanner le ticket en photo',aiCount:'1 requête IA'},
it:{title:'Scontrino',hint:'Basic: inserisci manualmente i dati dello scontrino. Ogni riga: nome; prezzo; quantità.',store:'Negozio',storePh:'Ad esempio, Carrefour',date:'Data di acquisto',items:'Articoli',itemsPh:'Latte; 1,50; 1\nPane; 2,00; 2\nMele; 3,50; 1,5',total:'Totale scontrino',totalPh:'Importo dello scontrino',manual:'Inserisci scontrino manualmente',photo:'Scansiona lo scontrino da foto',aiCount:'1 richiesta IA'},
pl:{title:'Paragon ze sklepu',hint:'Basic: wpisz dane paragonu ręcznie. Każdy wiersz produktu: nazwa; cena; ilość.',store:'Sklep',storePh:'Na przykład Biedronka',date:'Data zakupu',items:'Produkty',itemsPh:'Mleko; 1,50; 1\nChleb; 2,00; 2\nJabłka; 3,50; 1,5',total:'Suma paragonu',totalPh:'Kwota paragonu',manual:'Wpisz paragon ręcznie',photo:'Skanuj paragon ze zdjęcia',aiCount:'1 zapytanie AI'},
tr:{title:'Market fişi',hint:'Basic: fiş bilgilerini elle gir. Her ürün satırı: ad; fiyat; miktar.',store:'Mağaza',storePh:'Örneğin, Migros',date:'Satın alma tarihi',items:'Ürünler',itemsPh:'Süt; 1,50; 1\nEkmek; 2,00; 2\nElma; 3,50; 1,5',total:'Fiş toplamı',totalPh:'Fiş tutarı',manual:'Fişi elle gir',photo:'Fişi fotoğraftan tara',aiCount:'1 yapay zekâ isteği'},
zh:{title:'购物小票',hint:'Basic：手动填写小票信息。每行商品格式：名称；价格；数量。',store:'商店',storePh:'例如：超市',date:'购买日期',items:'商品',itemsPh:'牛奶；1.50；1\n面包；2.00；2\n苹果；3.50；1.5',total:'小票总额',totalPh:'小票金额',manual:'手动录入小票',photo:'拍照识别小票',aiCount:'1 次 AI 请求'}
};
function applyReceiptFormTranslations(){
 const lang=String(appData?.lang||'ru').toLowerCase().split('-')[0];
 const d=RECEIPT_FORM_I18N[lang]||RECEIPT_FORM_I18N.ru;
 const setText=(selector,value)=>{const el=document.querySelector(selector);if(el)el.textContent=value;};
 const setPlaceholder=(selector,value)=>{const el=document.querySelector(selector);if(el)el.placeholder=value;};
 setText('#modalReceiptEntry .modal-header h3',d.title);
 setText('#modalReceiptEntry .receipt-modal-hint',d.hint);
 setText('label[for="receiptStoreInput"]',d.store);
 setPlaceholder('#receiptStoreInput',d.storePh);
 setText('label[for="receiptDateInput"]',d.date);
 setText('label[for="receiptItemsInput"]',d.items);
 setPlaceholder('#receiptItemsInput',d.itemsPh);
 setText('label[for="receiptTotalInput"]',d.total);
 setPlaceholder('#receiptTotalInput',d.totalPh);
 setText('.receipt-action[onclick="openReceiptEntry()"] span',d.manual);
 setText('.receipt-photo-action span',d.photo);
 setText('.receipt-photo-action small',d.aiCount);
}

const RECEIPT_I18N = {
  ru:{expenseOnly:'Чек можно прикрепить только к расходу.',storeRequired:'Укажи название магазина.',itemsRequired:'Добавь хотя бы один товар. Формат: Название; цена; количество.',totalRequired:'Укажи сумму чека или цены товаров.',notFound:'Операция не найдена.',editFailed:'Не удалось изменить чек.',removeConfirm:'Убрать чек? Сам расход останется в истории.',deleteFailed:'Не удалось удалить чек.',imageOnly:'Выбери изображение чека.',tooLarge:'Фото должно быть меньше 8 МБ.',telegramOnly:'Открой приложение через Telegram, чтобы распознать чек.',processing:'📷 Распознаю чек… Обычно это занимает несколько секунд.',timeout:'Сервер слишком долго обрабатывает фото. Попробуй более чёткое фото или повтори попытку позже.',recognizeFailed:'Не удалось распознать чек.',itemsFound:'ИИ распознал товаров: {n}. Проверь названия, количество и цены перед сохранением.',itemsUnclear:'ИИ не смог уверенно прочитать товары. Проверь список и сумму перед сохранением.',aiDone:'✨ Чек обработан ИИ. Проверь распознанные данные перед сохранением.',ocrDone:'🧾 Использован резервный OCR. Проверь данные перед сохранением.',noText:'Фото получено, но текст не удалось прочитать. Сделай снимок ровно, без бликов, чтобы весь чек был в кадре.',rowsFound:'Распознано товаров: {n}. Проверь названия и цены перед сохранением.',pricesUnclear:'Не удалось уверенно распознать цены. Я убрал технический текст — проверь или поправь товары вручную.',receiptDone:'🧾 Чек распознан. Проверь очищенный список товаров и сумму.',partial:'🧾 Текст распознан частично. Лишние технические строки скрыты; проверь товары и сумму.',photoFailed:'Не удалось распознать фото.',added:'🧾 Чек добавлен: {store} · {n} поз. · {total}',addButton:'Добавить чек к операции',saveButton:'Сохранить изменения',reviewButton:'Проверить и сохранить чек'},
  uk:{expenseOnly:'Чек можна прикріпити лише до витрати.',storeRequired:'Вкажи назву магазину.',itemsRequired:'Додай хоча б один товар. Формат: Назва; ціна; кількість.',totalRequired:'Вкажи суму чека або ціни товарів.',notFound:'Операцію не знайдено.',editFailed:'Не вдалося змінити чек.',removeConfirm:'Прибрати чек? Сама витрата залишиться в історії.',deleteFailed:'Не вдалося видалити чек.',imageOnly:'Вибери зображення чека.',tooLarge:'Фото має бути меншим за 8 МБ.',telegramOnly:'Відкрий застосунок через Telegram, щоб розпізнати чек.',processing:'📷 Розпізнаю чек… Зазвичай це триває кілька секунд.',timeout:'Сервер надто довго обробляє фото. Спробуй чіткіше фото або повтори пізніше.',recognizeFailed:'Не вдалося розпізнати чек.',itemsFound:'ШІ розпізнав товарів: {n}. Перевір назви, кількість і ціни перед збереженням.',itemsUnclear:'ШІ не зміг упевнено прочитати товари. Перевір список і суму перед збереженням.',aiDone:'✨ Чек оброблено ШІ. Перевір розпізнані дані перед збереженням.',ocrDone:'🧾 Використано резервний OCR. Перевір дані перед збереженням.',noText:'Фото отримано, але текст не вдалося прочитати. Зроби рівний знімок без відблисків, щоб увесь чек був у кадрі.',rowsFound:'Розпізнано товарів: {n}. Перевір назви й ціни перед збереженням.',pricesUnclear:'Не вдалося впевнено розпізнати ціни. Технічний текст прибрано — перевір або виправ товари вручну.',receiptDone:'🧾 Чек розпізнано. Перевір очищений список товарів і суму.',partial:'🧾 Текст розпізнано частково. Зайві технічні рядки приховано; перевір товари й суму.',photoFailed:'Не вдалося розпізнати фото.',added:'🧾 Чек додано: {store} · {n} поз. · {total}',addButton:'Додати чек до операції',saveButton:'Зберегти зміни',reviewButton:'Перевірити й зберегти чек'},
  en:{expenseOnly:'A receipt can only be attached to an expense.',storeRequired:'Enter the store name.',itemsRequired:'Add at least one item. Format: Name; price; quantity.',totalRequired:'Enter the receipt total or item prices.',notFound:'Transaction not found.',editFailed:'Could not update the receipt.',removeConfirm:'Remove the receipt? The expense will remain in your history.',deleteFailed:'Could not delete the receipt.',imageOnly:'Choose a receipt image.',tooLarge:'The photo must be smaller than 8 MB.',telegramOnly:'Open the app in Telegram to scan a receipt.',processing:'📷 Scanning receipt… This usually takes a few seconds.',timeout:'The server is taking too long to process the photo. Try a clearer photo or try again later.',recognizeFailed:'Could not scan the receipt.',itemsFound:'AI recognized {n} items. Check names, quantities and prices before saving.',itemsUnclear:'AI could not confidently read the items. Check the list and total before saving.',aiDone:'✨ Receipt processed by AI. Review the recognized details before saving.',ocrDone:'🧾 Backup OCR was used. Review the details before saving.',noText:'The photo was received, but its text could not be read. Take a straight, glare-free photo with the whole receipt in frame.',rowsFound:'Recognized {n} items. Check names and prices before saving.',pricesUnclear:'Prices could not be recognized confidently. Technical text was removed — check or edit the items manually.',receiptDone:'🧾 Receipt scanned. Review the cleaned item list and total.',partial:'🧾 Text was only partly recognized. Extra technical lines were hidden; check the items and total.',photoFailed:'Could not process the photo.',added:'🧾 Receipt added: {store} · {n} items · {total}',addButton:'Add receipt to transaction',saveButton:'Save changes',reviewButton:'Review and save receipt'},
  de:{expenseOnly:'Ein Beleg kann nur an eine Ausgabe angehängt werden.',storeRequired:'Gib den Geschäftsnamen ein.',itemsRequired:'Füge mindestens einen Artikel hinzu. Format: Name; Preis; Menge.',totalRequired:'Gib den Gesamtbetrag oder Artikelpreise ein.',notFound:'Transaktion nicht gefunden.',editFailed:'Beleg konnte nicht geändert werden.',removeConfirm:'Beleg entfernen? Die Ausgabe bleibt im Verlauf.',deleteFailed:'Beleg konnte nicht gelöscht werden.',imageOnly:'Wähle ein Belegfoto aus.',tooLarge:'Das Foto muss kleiner als 8 MB sein.',telegramOnly:'Öffne die App in Telegram, um einen Beleg zu scannen.',processing:'📷 Beleg wird erkannt… Das dauert normalerweise nur wenige Sekunden.',timeout:'Der Server verarbeitet das Foto zu lange. Versuche ein schärferes Foto oder später erneut.',recognizeFailed:'Beleg konnte nicht erkannt werden.',itemsFound:'Die KI hat {n} Artikel erkannt. Prüfe Namen, Mengen und Preise vor dem Speichern.',itemsUnclear:'Die KI konnte die Artikel nicht sicher lesen. Prüfe Liste und Gesamtbetrag.',aiDone:'✨ Beleg mit KI verarbeitet. Prüfe die erkannten Daten vor dem Speichern.',ocrDone:'🧾 Ersatz-OCR wurde verwendet. Prüfe die Daten vor dem Speichern.',noText:'Das Foto wurde empfangen, aber der Text konnte nicht gelesen werden. Fotografiere den ganzen Beleg gerade und ohne Spiegelungen.',rowsFound:'{n} Artikel erkannt. Prüfe Namen und Preise vor dem Speichern.',pricesUnclear:'Preise konnten nicht sicher erkannt werden. Technischer Text wurde entfernt — prüfe die Artikel manuell.',receiptDone:'🧾 Beleg erkannt. Prüfe Artikelliste und Gesamtbetrag.',partial:'🧾 Text teilweise erkannt. Technische Zeilen wurden ausgeblendet; prüfe Artikel und Betrag.',photoFailed:'Foto konnte nicht verarbeitet werden.',added:'🧾 Beleg hinzugefügt: {store} · {n} Pos. · {total}',addButton:'Beleg zur Ausgabe hinzufügen',saveButton:'Änderungen speichern',reviewButton:'Beleg prüfen und speichern'},
  es:{expenseOnly:'Solo se puede adjuntar un recibo a un gasto.',storeRequired:'Indica el nombre de la tienda.',itemsRequired:'Añade al menos un artículo. Formato: Nombre; precio; cantidad.',totalRequired:'Indica el total del recibo o los precios.',notFound:'Transacción no encontrada.',editFailed:'No se pudo actualizar el recibo.',removeConfirm:'¿Quitar el recibo? El gasto seguirá en el historial.',deleteFailed:'No se pudo eliminar el recibo.',imageOnly:'Elige una imagen del recibo.',tooLarge:'La foto debe pesar menos de 8 MB.',telegramOnly:'Abre la aplicación en Telegram para escanear el recibo.',processing:'📷 Escaneando recibo… Normalmente tarda unos segundos.',timeout:'El servidor tarda demasiado. Prueba con una foto más nítida o inténtalo más tarde.',recognizeFailed:'No se pudo escanear el recibo.',itemsFound:'La IA reconoció {n} artículos. Revisa nombres, cantidades y precios antes de guardar.',itemsUnclear:'La IA no pudo leer los artículos con seguridad. Revisa la lista y el total.',aiDone:'✨ Recibo procesado por IA. Revisa los datos antes de guardar.',ocrDone:'🧾 Se utilizó el OCR alternativo. Revisa los datos antes de guardar.',noText:'Se recibió la foto, pero no se pudo leer el texto. Fotografía todo el recibo de frente y sin reflejos.',rowsFound:'Se reconocieron {n} artículos. Revisa nombres y precios antes de guardar.',pricesUnclear:'No se pudieron reconocer los precios con seguridad. Se eliminó el texto técnico; revisa los artículos manualmente.',receiptDone:'🧾 Recibo reconocido. Revisa la lista y el total.',partial:'🧾 Texto reconocido parcialmente. Se ocultaron líneas técnicas; revisa los artículos y el total.',photoFailed:'No se pudo procesar la foto.',added:'🧾 Recibo añadido: {store} · {n} art. · {total}',addButton:'Añadir recibo al gasto',saveButton:'Guardar cambios',reviewButton:'Revisar y guardar recibo'},
  fr:{expenseOnly:'Un reçu ne peut être joint qu’à une dépense.',storeRequired:'Indique le nom du magasin.',itemsRequired:'Ajoute au moins un article. Format : Nom ; prix ; quantité.',totalRequired:'Indique le total du reçu ou les prix des articles.',notFound:'Transaction introuvable.',editFailed:'Impossible de modifier le reçu.',removeConfirm:'Supprimer le reçu ? La dépense restera dans l’historique.',deleteFailed:'Impossible de supprimer le reçu.',imageOnly:'Choisis une image du reçu.',tooLarge:'La photo doit faire moins de 8 Mo.',telegramOnly:'Ouvre l’application dans Telegram pour scanner le reçu.',processing:'📷 Lecture du reçu… Cela prend généralement quelques secondes.',timeout:'Le serveur met trop de temps à traiter la photo. Essaie une photo plus nette ou réessaie plus tard.',recognizeFailed:'Impossible de lire le reçu.',itemsFound:'L’IA a reconnu {n} articles. Vérifie les noms, quantités et prix avant l’enregistrement.',itemsUnclear:'L’IA n’a pas pu lire les articles avec certitude. Vérifie la liste et le total.',aiDone:'✨ Reçu traité par IA. Vérifie les données avant l’enregistrement.',ocrDone:'🧾 OCR de secours utilisé. Vérifie les données avant l’enregistrement.',noText:'La photo a été reçue, mais le texte est illisible. Prends le reçu entier de face, sans reflets.',rowsFound:'{n} articles reconnus. Vérifie les noms et les prix avant l’enregistrement.',pricesUnclear:'Les prix n’ont pas pu être reconnus avec certitude. Le texte technique a été retiré ; vérifie les articles manuellement.',receiptDone:'🧾 Reçu reconnu. Vérifie la liste et le total.',partial:'🧾 Texte partiellement reconnu. Les lignes techniques ont été masquées ; vérifie les articles et le total.',photoFailed:'Impossible de traiter la photo.',added:'🧾 Reçu ajouté : {store} · {n} art. · {total}',addButton:'Ajouter le reçu à la dépense',saveButton:'Enregistrer les modifications',reviewButton:'Vérifier et enregistrer le reçu'},
  it:{expenseOnly:'La ricevuta può essere allegata solo a una spesa.',storeRequired:'Inserisci il nome del negozio.',itemsRequired:'Aggiungi almeno un articolo. Formato: Nome; prezzo; quantità.',totalRequired:'Inserisci il totale o i prezzi degli articoli.',notFound:'Transazione non trovata.',editFailed:'Impossibile modificare la ricevuta.',removeConfirm:'Rimuovere la ricevuta? La spesa resterà nella cronologia.',deleteFailed:'Impossibile eliminare la ricevuta.',imageOnly:'Scegli un’immagine della ricevuta.',tooLarge:'La foto deve essere inferiore a 8 MB.',telegramOnly:'Apri l’app in Telegram per scansionare la ricevuta.',processing:'📷 Scansione della ricevuta… Di solito bastano pochi secondi.',timeout:'Il server impiega troppo tempo. Prova una foto più nitida o riprova più tardi.',recognizeFailed:'Impossibile leggere la ricevuta.',itemsFound:'L’IA ha riconosciuto {n} articoli. Controlla nomi, quantità e prezzi prima di salvare.',itemsUnclear:'L’IA non è riuscita a leggere gli articoli con sicurezza. Controlla elenco e totale.',aiDone:'✨ Ricevuta elaborata con IA. Controlla i dati prima di salvare.',ocrDone:'🧾 È stato usato l’OCR di riserva. Controlla i dati prima di salvare.',noText:'Foto ricevuta, ma il testo non è leggibile. Fotografa tutta la ricevuta frontalmente e senza riflessi.',rowsFound:'Riconosciuti {n} articoli. Controlla nomi e prezzi prima di salvare.',pricesUnclear:'Impossibile riconoscere i prezzi con sicurezza. Il testo tecnico è stato rimosso: controlla gli articoli manualmente.',receiptDone:'🧾 Ricevuta riconosciuta. Controlla elenco e totale.',partial:'🧾 Testo riconosciuto parzialmente. Le righe tecniche sono nascoste; controlla articoli e totale.',photoFailed:'Impossibile elaborare la foto.',added:'🧾 Ricevuta aggiunta: {store} · {n} art. · {total}',addButton:'Aggiungi ricevuta alla spesa',saveButton:'Salva modifiche',reviewButton:'Controlla e salva ricevuta'},
  pl:{expenseOnly:'Paragon można dołączyć tylko do wydatku.',storeRequired:'Wpisz nazwę sklepu.',itemsRequired:'Dodaj co najmniej jeden produkt. Format: Nazwa; cena; ilość.',totalRequired:'Wpisz sumę paragonu lub ceny produktów.',notFound:'Nie znaleziono transakcji.',editFailed:'Nie udało się zmienić paragonu.',removeConfirm:'Usunąć paragon? Wydatek pozostanie w historii.',deleteFailed:'Nie udało się usunąć paragonu.',imageOnly:'Wybierz zdjęcie paragonu.',tooLarge:'Zdjęcie musi mieć mniej niż 8 MB.',telegramOnly:'Otwórz aplikację w Telegramie, aby zeskanować paragon.',processing:'📷 Skanowanie paragonu… Zwykle trwa to kilka sekund.',timeout:'Serwer zbyt długo przetwarza zdjęcie. Spróbuj wyraźniejszego zdjęcia lub ponownie później.',recognizeFailed:'Nie udało się odczytać paragonu.',itemsFound:'AI rozpoznało {n} produktów. Sprawdź nazwy, ilości i ceny przed zapisaniem.',itemsUnclear:'AI nie mogło pewnie odczytać produktów. Sprawdź listę i sumę.',aiDone:'✨ Paragon przetworzony przez AI. Sprawdź dane przed zapisaniem.',ocrDone:'🧾 Użyto zapasowego OCR. Sprawdź dane przed zapisaniem.',noText:'Otrzymano zdjęcie, ale nie udało się odczytać tekstu. Zrób proste zdjęcie całego paragonu bez odblasków.',rowsFound:'Rozpoznano {n} produktów. Sprawdź nazwy i ceny przed zapisaniem.',pricesUnclear:'Nie udało się pewnie rozpoznać cen. Usunięto tekst techniczny — sprawdź produkty ręcznie.',receiptDone:'🧾 Paragon rozpoznany. Sprawdź listę i sumę.',partial:'🧾 Tekst rozpoznano częściowo. Ukryto techniczne wiersze; sprawdź produkty i sumę.',photoFailed:'Nie udało się przetworzyć zdjęcia.',added:'🧾 Dodano paragon: {store} · {n} poz. · {total}',addButton:'Dodaj paragon do wydatku',saveButton:'Zapisz zmiany',reviewButton:'Sprawdź i zapisz paragon'},
  tr:{expenseOnly:'Fiş yalnızca bir gidere eklenebilir.',storeRequired:'Mağaza adını gir.',itemsRequired:'En az bir ürün ekle. Biçim: Ad; fiyat; miktar.',totalRequired:'Fiş toplamını veya ürün fiyatlarını gir.',notFound:'İşlem bulunamadı.',editFailed:'Fiş güncellenemedi.',removeConfirm:'Fiş kaldırılsın mı? Gider geçmişte kalacak.',deleteFailed:'Fiş silinemedi.',imageOnly:'Bir fiş görseli seç.',tooLarge:'Fotoğraf 8 MB’tan küçük olmalı.',telegramOnly:'Fişi taramak için uygulamayı Telegram içinde aç.',processing:'📷 Fiş taranıyor… Genellikle birkaç saniye sürer.',timeout:'Sunucu fotoğrafı çok uzun süredir işliyor. Daha net bir fotoğraf dene veya sonra tekrar dene.',recognizeFailed:'Fiş okunamadı.',itemsFound:'Yapay zekâ {n} ürün tanıdı. Kaydetmeden önce adları, miktarları ve fiyatları kontrol et.',itemsUnclear:'Yapay zekâ ürünleri güvenilir şekilde okuyamadı. Listeyi ve toplamı kontrol et.',aiDone:'✨ Fiş yapay zekâ ile işlendi. Kaydetmeden önce bilgileri kontrol et.',ocrDone:'🧾 Yedek OCR kullanıldı. Kaydetmeden önce bilgileri kontrol et.',noText:'Fotoğraf alındı ancak metin okunamadı. Fişin tamamını yansıma olmadan düz açıyla çek.',rowsFound:'{n} ürün tanındı. Kaydetmeden önce adları ve fiyatları kontrol et.',pricesUnclear:'Fiyatlar güvenilir şekilde tanınamadı. Teknik metin kaldırıldı — ürünleri elle kontrol et.',receiptDone:'🧾 Fiş tanındı. Ürün listesini ve toplamı kontrol et.',partial:'🧾 Metin kısmen tanındı. Teknik satırlar gizlendi; ürünleri ve toplamı kontrol et.',photoFailed:'Fotoğraf işlenemedi.',added:'🧾 Fiş eklendi: {store} · {n} ürün · {total}',addButton:'Gidere fiş ekle',saveButton:'Değişiklikleri kaydet',reviewButton:'Fişi kontrol et ve kaydet'},
  zh:{expenseOnly:'收据只能附加到支出。',storeRequired:'请输入商店名称。',itemsRequired:'至少添加一件商品。格式：名称；价格；数量。',totalRequired:'请输入收据总额或商品价格。',notFound:'未找到交易记录。',editFailed:'无法修改收据。',removeConfirm:'移除收据？支出记录仍会保留。',deleteFailed:'无法删除收据。',imageOnly:'请选择收据图片。',tooLarge:'照片必须小于 8 MB。',telegramOnly:'请在 Telegram 中打开应用以识别收据。',processing:'📷 正在识别收据… 通常需要几秒钟。',timeout:'服务器处理照片超时。请尝试更清晰的照片，或稍后重试。',recognizeFailed:'无法识别收据。',itemsFound:'AI 识别出 {n} 件商品。保存前请检查名称、数量和价格。',itemsUnclear:'AI 无法准确读取商品。保存前请检查清单和总额。',aiDone:'✨ AI 已处理收据。保存前请检查识别结果。',ocrDone:'🧾 已使用备用 OCR。保存前请检查数据。',noText:'已收到照片，但无法读取文字。请正对收据拍摄，避免反光并确保完整入镜。',rowsFound:'已识别 {n} 件商品。保存前请检查名称和价格。',pricesUnclear:'无法可靠识别价格。已移除技术文本，请手动检查商品。',receiptDone:'🧾 收据识别完成。请检查商品清单和总额。',partial:'🧾 仅部分识别文字。已隐藏多余技术行，请检查商品和总额。',photoFailed:'无法处理照片。',added:'🧾 已添加收据：{store} · {n} 项 · {total}',addButton:'将收据添加到支出',saveButton:'保存更改',reviewButton:'检查并保存收据'}
};
function receiptUi(key, values={}){
  const lang = String(appData?.lang || 'ru').toLowerCase().split('-')[0];
  let value = (RECEIPT_I18N[lang] && RECEIPT_I18N[lang][key]) || RECEIPT_I18N.ru[key] || key;
  Object.keys(values).forEach(name=>{ value=value.replaceAll('{'+name+'}',String(values[name])); });
  return value;
}

function openReceiptEntry(){
  receiptEditingTxId = null;
  const receiptSaveButton=document.querySelector('#modalReceiptEntry button[onclick="saveReceiptDraft()"]');
  if(receiptSaveButton)receiptSaveButton.innerHTML='<i class="fa-solid fa-check"></i> '+receiptUi('addButton');
  if(appData.activeTxType !== 'expense'){
    alert(receiptUi('expenseOnly'));
    return;
  }
  const error = document.getElementById('receiptEntryError');
  if(error) error.textContent = '';
  if(!pendingReceiptDraft){
    document.getElementById('receiptStoreInput').value = '';
    document.getElementById('receiptItemsInput').value = '';
    document.getElementById('receiptTotalInput').value = '';
    document.getElementById('receiptDateInput').value = new Date().toISOString().slice(0,10);
  }
  openModal('modalReceiptEntry');
}

async function saveReceiptDraft(){
  const store = document.getElementById('receiptStoreInput').value.trim();
  const date = document.getElementById('receiptDateInput').value || new Date().toISOString().slice(0,10);
  const rawItems = document.getElementById('receiptItemsInput').value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const error = document.getElementById('receiptEntryError');
  const parsedItems = rawItems.map(line => {
    const parts = line.split(';').map(part => part.trim());
    const name = (parts[0] || '').slice(0,80);
    const price = parts[1] === undefined || parts[1] === '' ? null : Number(parts[1].replace(',', '.'));
    const quantity = parts[2] === undefined || parts[2] === '' ? 1 : Number(parts[2].replace(',', '.'));
    return {name, price: Number.isFinite(price) && price >= 0 ? price : null, quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1};
  }).filter(item => item.name).slice(0,50);
  const enteredRaw = document.getElementById('receiptTotalInput').value;
  const enteredTotal = enteredRaw === '' ? NaN : Number(enteredRaw.replace(',', '.'));
  const calculatedTotal = parsedItems.reduce((sum, item) => sum + (item.price === null ? 0 : item.price * item.quantity), 0);
  const total = Number.isFinite(enteredTotal) && enteredTotal > 0 ? enteredTotal : calculatedTotal;
  if(!store){ error.textContent = receiptUi('storeRequired'); return; }
  if(!parsedItems.length){ error.textContent = receiptUi('itemsRequired'); return; }
  if(!Number.isFinite(total) || total <= 0){ error.textContent = receiptUi('totalRequired'); return; }
  const draft = {store, date, items:parsedItems, total:Math.round(total*100)/100, source:'manual'};
  if(receiptEditingTxId !== null){
    try{
      const tx = budgetMode==='family' ? familyTransactions.find(item=>String(item.id)===String(receiptEditingTxId)) : appData.history.find(item=>String(item.id)===String(receiptEditingTxId));
      if(!tx) throw new Error(receiptUi('notFound'));
      if(budgetMode==='family' && currentFamily){
        await familyRequest('/api/family/transactions/'+encodeURIComponent(String(receiptEditingTxId)),'PATCH',{receipt:draft,amount:draft.total,title:tx.title || draft.store});
        await loadFamilyTransactions();
      } else {
        const oldAmount=Number(tx.amount||0), nextAmount=draft.total, delta=nextAmount-oldAmount;
        const affectsCurrentMonth=isTransactionInCurrentMonth(tx);
        tx.receipt=draft; tx.amount=nextAmount; tx.title=tx.title || draft.store;
        if(tx.type==='expense'){appData.balance-=delta;if(affectsCurrentMonth)appData.monthExpense+=delta;}
        else{appData.balance+=delta;if(affectsCurrentMonth)appData.monthIncome+=delta;}
        saveData(); renderAll();
      }
      receiptEditingTxId=null; closeModal('modalReceiptEntry'); return;
    }catch(e){ if(error)error.textContent=e.message||receiptUi('editFailed'); return; }
  }
  pendingReceiptDraft = draft;
  const amountInput = document.getElementById('txAmountInput');
  const commentInput = document.getElementById('txCommentInput');
  if(amountInput) amountInput.value = String(pendingReceiptDraft.total);
  if(commentInput && !commentInput.value.trim()) commentInput.value = store;
  const status = document.getElementById('receiptDraftStatus');
  if(status){ status.style.display = 'block'; status.textContent = receiptUi('added',{store,n:pendingReceiptDraft.items.length,total:fmtMoney(pendingReceiptDraft.total)}); }
  closeModal('modalReceiptEntry');
}

function editReceipt(id){
  const tx = budgetMode==='family' ? familyTransactions.find(item=>String(item.id)===String(id)) : appData.history.find(item=>String(item.id)===String(id));
  if(!tx || !tx.receipt) return;
  receiptEditingTxId = id;
  const receipt=tx.receipt;
  document.getElementById('receiptStoreInput').value=receipt.store||'';
  document.getElementById('receiptDateInput').value=receipt.date||new Date().toISOString().slice(0,10);
  document.getElementById('receiptItemsInput').value=(receipt.items||[]).map(item=>item.name+'; '+(item.price==null?'':item.price)+'; '+(item.quantity||1)).join('\n');
  document.getElementById('receiptTotalInput').value=receipt.total||tx.amount||'';
  const error=document.getElementById('receiptEntryError'); if(error)error.textContent='';
  const saveButton=document.querySelector('#modalReceiptEntry button[onclick="saveReceiptDraft()"]');
  if(saveButton)saveButton.innerHTML='<i class="fa-solid fa-check"></i> '+receiptUi('saveButton');
  openModal('modalReceiptEntry');
}

async function deleteReceipt(id){
  const tx = budgetMode==='family' ? familyTransactions.find(item=>String(item.id)===String(id)) : appData.history.find(item=>String(item.id)===String(id));
  if(!tx || !tx.receipt) return;
  if(!window.confirm(receiptUi('removeConfirm'))) return;
  try{
    if(budgetMode==='family' && currentFamily){
      await familyRequest('/api/family/transactions/'+encodeURIComponent(String(id)),'PATCH',{receipt:null});
      await loadFamilyTransactions();
    } else {
      tx.receipt=null;
      saveData(); renderAll();
    }
  }catch(e){alert(e.message||receiptUi('deleteFailed'));}
}

function openReceiptPhoto(){
  const picker = document.getElementById('receiptPhotoInput');
  if(picker) picker.click();
}

async function handleReceiptPhotoSelected(event){
  const file = event.target.files && event.target.files[0];
  if(!file) return;
  const picker = event.target;
  if(!file.type.startsWith('image/')){ alert(receiptUi('imageOnly')); picker.value=''; return; }
  if(file.size > 8 * 1024 * 1024){ alert(receiptUi('tooLarge')); picker.value=''; return; }
  const tg = window.Telegram?.WebApp;
  if(!tg?.initData){ alert(receiptUi('telegramOnly')); picker.value=''; return; }
  const status = document.getElementById('receiptDraftStatus');
  const setStatus = message => { if(status){ status.style.display='block'; status.textContent=message; } };
  setStatus(receiptUi('processing'));
  let timeoutId;
  const controller = new AbortController();
  try{
    const form = new FormData();
    form.append('file', file, file.name || 'receipt.jpg');
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new Error(receiptUi('timeout')));
      }, 45000);
    });
    const request = fetch('/api/receipt/recognize', {
      method:'POST', headers:{'X-Init-Data':tg.initData}, body:form, signal:controller.signal
    });
    const response = await Promise.race([request, timeout]);
    clearTimeout(timeoutId);
    const data = await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.detail || receiptUi('recognizeFailed'));
    refreshAIStatus();
    // Prefer structured fields from the vision model over OCR line heuristics.
    if(data.receipt && typeof data.receipt === "object"){
      const receipt = data.receipt;
      const items = Array.isArray(receipt.items) ? receipt.items : [];
      const storeInput = document.getElementById("receiptStoreInput");
      const dateInput = document.getElementById("receiptDateInput");
      const itemsInput = document.getElementById("receiptItemsInput");
      const totalInput = document.getElementById("receiptTotalInput");
      if(storeInput) storeInput.value = String(receipt.store || "");
      if(dateInput) dateInput.value = /^\d{4}-\d{2}-\d{2}$/.test(String(receipt.date || "")) ? receipt.date : new Date().toISOString().slice(0,10);
      if(itemsInput) itemsInput.value = items.slice(0,40).map(item=>{
        const name = String(item.name || "").replace(/[;\r\n]+/g," ").trim();
        const price = Number(item.price);
        const quantity = Number(item.quantity || 1);
        return name && Number.isFinite(price) && price > 0 ? name+"; "+price+"; "+(Number.isFinite(quantity)&&quantity>0?quantity:1) : "";
      }).filter(Boolean).join("\n");
      const total = Number(receipt.total || data.amount_guess || 0);
      if(totalInput) totalInput.value = Number.isFinite(total) && total > 0 ? String(total) : "";
      const error = document.getElementById("receiptEntryError");
      if(error) error.textContent = items.length
        ? receiptUi('itemsFound',{n:items.length})
        : receiptUi('itemsUnclear');
      const saveButton = document.querySelector('#modalReceiptEntry button[onclick="saveReceiptDraft()"]');
      if(saveButton) saveButton.innerHTML = '<i class="fa-solid fa-check"></i> '+receiptUi('reviewButton');
      setStatus(data.source === "ai" ? receiptUi('aiDone') : receiptUi('ocrDone'));
      openModal("modalReceiptEntry");
      return;
    }
    const lines = (Array.isArray(data.lines) ? data.lines : String(data.text||'').split(/\r?\n/))
      .map(line=>String(line).replace(/\s+/g,' ').trim())
      .filter(Boolean);
    if(!lines.length) throw new Error(receiptUi('noText'));

    // Don't dump the whole OCR output into the form: it contains fiscal codes,
    // payment details and recognition noise. Keep likely product rows only.
    const skipLine = /итого|всього|разом|к оплате|до сплати|сума|total|subtotal|tax|пдв|ндс|решта|здача|касир|кассир|фіскал|фискал|чек №|receipt|термінал|терминал|готівк|наличн|безгот|картк|карта|дякуємо|спасибо|thank you|адрес|тел\.?|єдрпоу|едрпоу|фн\s*\d|рро|пн\s*\d/i;
    const cleaned = lines.map(line=>line.replace(/^\s*\d{1,3}[.)]\s*/, '').trim())
      .filter(line=>line.length>=3 && line.length<=90 && !skipLine.test(line));
    const store = (cleaned.find(line=>/[A-Za-zА-Яа-яІіЇїЄєҐґ]{3}/.test(line)) || '').slice(0,80);
    const moneyAtEnd = /^(.*?)[\s*]+(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:₴|грн\.?|uah)?$/i;
    const moneyOnly = /^\s*(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:₴|грн\.?|uah)?\s*$/i;
    const productRows = [];
    for(let i=0;i<cleaned.length;i++){
      const line=cleaned[i];
      if(skipLine.test(line)) continue;
      const match=line.match(moneyAtEnd);
      if(match && /[A-Za-zА-Яа-яІіЇїЄєҐґ]{2}/.test(match[1])){
        const name=match[1].replace(/[|_]+/g,' ').trim().slice(0,80);
        const price=Number(match[2].replace(',','.'));
        if(name.length>=2 && Number.isFinite(price) && price>0 && price<100000){
          productRows.push({name,price});
          continue;
        }
      }
      const next=cleaned[i+1]||'';
      const nextPrice=next.match(moneyOnly);
      if(nextPrice && /[A-Za-zА-Яа-яІіЇїЄєҐґ]{2}/.test(line)){
        const price=Number(nextPrice[1].replace(',','.'));
        if(Number.isFinite(price)&&price>0&&price<100000) productRows.push({name:line.slice(0,80),price});
        i++;
      }
    }
    // If OCR cannot reliably pair names with prices, show only a few clean names
    // rather than dozens of technical lines. The user can correct them manually.
    const uniqueRows=[];
    const seenNames=new Set();
    for(const row of productRows){
      const key=row.name.toLowerCase();
      if(!seenNames.has(key)){seenNames.add(key);uniqueRows.push(row);}
    }
    const fallbackNames = uniqueRows.length ? [] : cleaned
      .filter(line=>line!==store && line.length>=3 && line.length<=55 && !/\d{5,}/.test(line))
      .slice(0,8);
    const itemLines = uniqueRows.length
      ? uniqueRows.slice(0,20).map(row=>row.name+'; '+row.price+'; 1')
      : fallbackNames;
    document.getElementById('receiptStoreInput').value = store;
    document.getElementById('receiptDateInput').value = new Date().toISOString().slice(0,10);
    document.getElementById('receiptItemsInput').value = itemLines.join('\n');
    document.getElementById('receiptTotalInput').value = Number(data.amount_guess || 0) > 0 ? String(data.amount_guess) : '';
    const error = document.getElementById('receiptEntryError');
    if(error) error.textContent = uniqueRows.length
      ? receiptUi('rowsFound',{n:uniqueRows.length})
      : 'Не удалось уверенно распознать цены. Я убрал технический текст — проверь или поправь товары вручную.';
    const saveButton = document.querySelector('#modalReceiptEntry button[onclick="saveReceiptDraft()"]');
    if(saveButton) saveButton.innerHTML = '<i class="fa-solid fa-check"></i> '+receiptUi('reviewButton');
    setStatus(uniqueRows.length
      ? '🧾 Чек распознан. Проверь очищенный список товаров и сумму.'
      : '🧾 Текст распознан частично. Лишние технические строки скрыты; проверь товары и сумму.');
    openModal('modalReceiptEntry');
  }catch(error){
    clearTimeout(timeoutId);
    setStatus('⚠️ ' + (error.message || receiptUi('photoFailed')));
    console.error('Receipt recognition failed:', error);
  }finally{
    clearTimeout(timeoutId);
    picker.value = '';
  }
}

function openCustomCategoryModal(){
  if(!canUseProFeatures){
    requestProFeature('Свои категории');
    return;
  }
  openModal('modalAddCategory');
}

function openWallpaperUpload(){
  if(!canUseProFeatures){
    requestProFeature('Персональные обои');
    return;
  }
  document.getElementById('wallpaperFile').click();
}

function renderReferralStats(){
  const refs=document.getElementById('referralCountValue'),c10=document.getElementById('coupon10CountValue'),c20=document.getElementById('coupon20CountValue');
  const paid=document.getElementById('referralPaidCountValue'),volume=document.getElementById('referralVolumeValue'),days=document.getElementById('referralSeasonDays'),link=document.getElementById('referralLinkInput');
  if(refs)refs.textContent=String(Number(referralStats.count||0));
  if(c10)c10.textContent=String(Number(referralStats.coupons10||0));
  if(c20)c20.textContent=String(Number(referralStats.coupons20||0));
  if(paid)paid.textContent=String(Number(battlePassStats.paidCount||0));
  if(volume)volume.textContent='$'+Number(battlePassStats.volumeUsd||0).toLocaleString('en-US',{maximumFractionDigits:2});
  const now=new Date();
  const endDate=new Date(now.getFullYear(),now.getMonth()+1,0);
  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const localDaysLeft=Math.max(0,Math.ceil((endDate-today)/86400000));
  const daysLeft=battlePassStats.monthKey?Number(battlePassStats.daysLeft??localDaysLeft):localDaysLeft;
  if(days)days.textContent=String(daysLeft);
  const tg=window.Telegram?.WebApp;
  let tgUserId=tg?.initDataUnsafe?.user?.id||'';
  if(!tgUserId&&tg?.initData){
    try{
      const rawUser=new URLSearchParams(tg.initData).get('user');
      if(rawUser)tgUserId=JSON.parse(rawUser).id||'';
    }catch(error){console.warn('Could not read Telegram user for referral fallback:',error);}
  }
  const fallbackLink=tgUserId?('https://t.me/moneyfamilybudget_bot?start=ref_'+tgUserId):'';
  const referralLink=String(referralStats.link||fallbackLink||'');
  if(link){
    link.value=referralLink;
    link.placeholder=referralLink?'':'Открой приложение через Telegram, чтобы получить ссылку';
  }
  renderBattlePass();
}
function setBattlePassTrack(track){
  battlePassTrack=track==='pro'?'pro':'free';
  document.getElementById('battlePassFreeBtn')?.classList.toggle('active',battlePassTrack==='free');
  document.getElementById('battlePassProBtn')?.classList.toggle('active',battlePassTrack==='pro');
  renderBattlePass();
}
function battlePassTierRequirement(tier){
  const task=BATTLE_PASS_TASKS[(tier-1)%BATTLE_PASS_TASKS.length];
  return {...task,target:task.target*(Math.floor((tier-1)/BATTLE_PASS_TASKS.length)+1)};
}
function renderBattlePass(){
  const tasksEl=document.getElementById('battlePassTasks');
  const rewardsEl=document.getElementById('battlePassRewards');
  if(!tasksEl||!rewardsEl)return;
  const stats={count:Number(referralStats.seasonCount||0),paidCount:Number(battlePassStats.paidCount||0),volumeUsd:Number(battlePassStats.volumeUsd||0)};
  const completed=BATTLE_PASS_TASKS.filter(taskItem=>stats[taskItem.metric]>=taskItem.target).length;
  const season=document.getElementById('battlePassSeason');
  if(season){
    const startDate=battlePassStats.startDate;
    const date=startDate?new Date(startDate+'T00:00:00'):new Date();
    season.textContent=date.toLocaleDateString(appData.lang||'ru',{month:'long',year:'numeric'});
  }
  const progressText=document.getElementById('battlePassProgressText');
  if(progressText)progressText.textContent=completed+' / '+BATTLE_PASS_TASKS.length+' '+t('заданий');
  const bar=document.getElementById('battlePassProgressBar');
  if(bar)bar.style.width=(completed/BATTLE_PASS_TASKS.length*100)+'%';
  tasksEl.innerHTML=BATTLE_PASS_TASKS.map(taskItem=>{
    const val=stats[taskItem.metric],done=val>=taskItem.target;
    const shown=taskItem.metric==='volumeUsd'?'$'+Number(val).toLocaleString('en-US',{maximumFractionDigits:2}):String(val);
    const target=taskItem.metric==='volumeUsd'?'$'+taskItem.target:String(taskItem.target);
    return '<div class="battlepass-task '+(done?'is-done':'')+'"><span class="battlepass-task-icon">'+(done?'✓':'🎯')+'</span><div><b>'+t(taskItem.title)+'</b><small>'+t(taskItem.desc)+'</small><div class="battlepass-task-meter">'+shown+' / '+target+'</div></div></div>';
  }).join('');
  const isPro=battlePassTrack==='pro';
  const claimed=new Set((battlePassStats.claimed?.[battlePassTrack]||[]).map(Number));
  const hasPro=Boolean(canUseProFeatures);
  rewardsEl.innerHTML=Array.from({length:30},(_,index)=>{
    const tier=index+1,task=battlePassTierRequirement(tier);
    const unlocked=stats[task.metric]>=task.target;
    const coupon=(isPro||tier%5===0)?10:0;
    const earned=claimed.has(tier),proLocked=isPro&&!hasPro;
    const label=coupon?t('Купон −')+coupon+'%':(isPro?t('PRO бонус'):t('Монеты'));
    const status=earned?t('Получено'):(proLocked?t('Нужен PRO'):(unlocked?t('Забрать'):t('Уровень ')+tier));
    const disabled=earned||proLocked||!unlocked;
    return '<div class="battlepass-reward '+(unlocked?'is-unlocked ':'')+(earned?'is-claimed ':'')+(proLocked?'is-locked ':'')+'"><div class="battlepass-tier">'+t('УРОВЕНЬ')+' '+tier+'</div><div class="battlepass-reward-icon">'+(coupon?'🎟️':(isPro?'💎':'🪙'))+'</div><b>'+label+'</b><small>'+(coupon?t('Награда сезона'):(isPro?t('PRO бонус'):t('Опыт сезона')))+'</small><button class="btn btn-sm '+(disabled?'btn-outline':'btn-accent')+'" '+(disabled?'disabled':'')+' onclick="claimBattlePassReward(\''+battlePassTrack+'\','+tier+')">'+status+'</button></div>';
  }).join('');
  const note=document.getElementById('battlePassTrackNote');
  if(note)note.textContent=isPro?(hasPro?t('PRO: купон 10% на каждом из 30 уровней.'):t('Платная дорожка доступна с активной подпиской PRO.')):t('Бесплатная дорожка: 30 уровней, купоны на уровнях 5, 10, 15, 20, 25 и 30.');
}
async function claimBattlePassReward(track,tier){
  try{const tg=window.Telegram?.WebApp,response=await fetch('/api/battlepass/claim',{method:'POST',headers:{'Content-Type':'application/json','X-Init-Data':tg?.initData||''},body:JSON.stringify({track,tier})}),data=await response.json();if(!response.ok)throw new Error(data.detail||'Не удалось забрать награду');battlePassStats.claimed=data.claimed||battlePassStats.claimed;referralStats.coupons10=Number(referralStats.coupons10||0)+Number(data.couponsAdded||0);renderReferralStats();updateCouponSelector();tg?.showAlert?.(_localizeDialogMessage(t('reward_claimed')));}catch(e){const tg=window.Telegram?.WebApp;if(tg?.showAlert)tg.showAlert(_localizeDialogMessage(e.message||t('reward_claim_error')));else alert(e.message||'Ошибка получения награды');}
}

function selectCoupon(value){
  const select = document.getElementById('couponTypeSelect');
  if(!select) return;
  select.value = value;
  updateCouponSelector();
}

function updateCouponSelector(){
  const select = document.getElementById('couponTypeSelect');
  const info = document.getElementById('couponAvailabilityText');
  if(!select) return;
  const count10 = Number(referralStats.coupons10 || 0);
  const count20 = Number(referralStats.coupons20 || 0);
  const option10 = select.querySelector('option[value="10"]');
  const option20 = select.querySelector('option[value="20"]');
  if(option10) option10.disabled = count10 <= 0;
  if(option20) option20.disabled = count20 <= 0;
  if(select.value === '10' && count10 <= 0) select.value = '';
  if(select.value === '20' && count20 <= 0) select.value = '';

  const choice10 = document.getElementById('couponChoice10');
  const choice20 = document.getElementById('couponChoice20');
  const choiceNone = document.getElementById('couponChoiceNone');
  const stock10 = document.getElementById('coupon10Stock');
  const stock20 = document.getElementById('coupon20Stock');
  if(choice10){
    choice10.disabled = count10 <= 0;
    choice10.classList.toggle('selected', select.value === '10');
    choice10.setAttribute('aria-pressed', String(select.value === '10'));
  }
  if(choice20){
    choice20.disabled = count20 <= 0;
    choice20.classList.toggle('selected', select.value === '20');
    choice20.setAttribute('aria-pressed', String(select.value === '20'));
  }
  if(choiceNone){
    choiceNone.classList.toggle('selected', !select.value);
    choiceNone.setAttribute('aria-pressed', String(!select.value));
  }
  if(stock10) stock10.textContent = count10 > 0 ? t('Доступно купонов: ') + count10 : t('Пока нет купонов');
  if(stock20) stock20.textContent = count20 > 0 ? t('Доступно купонов: ') + count20 : t('Пока нет купонов');
  if(info){
    if(select.value === '10') info.innerHTML = '<i class="fa-solid fa-circle-check"></i><span>Скидка 10% выбрана. Купон спишется после подтверждения оплаты.</span>';
    else if(select.value === '20') info.innerHTML = '<i class="fa-solid fa-circle-check"></i><span>Скидка 20% выбрана. Купон спишется после подтверждения оплаты.</span>';
    else info.innerHTML = '<i class="fa-solid fa-shield-halved"></i><span>'+t('Выбери доступный купон или продолжай без скидки. Купон списывается только после оплаты.')+'</span>';
  }
  updatePricingDisplay();
}

function updatePricingDisplay(){
  const select = document.getElementById('couponTypeSelect');
  const percent = select && (select.value === '10' || select.value === '20') ? Number(select.value) : 0;
  document.querySelectorAll('.price-main[data-base-usd]').forEach(el => {
    const base = Number(el.dataset.baseUsd || 0);
    const period = el.querySelector('.pro-period');
    const periodText = period ? period.textContent : '';
    const discounted = Math.round((base * (100 - percent) / 100) * 100) / 100;
    let formatted = discounted.toFixed(2);
    if (formatted.endsWith('.00')) formatted = formatted.slice(0, -3);
    else if (formatted.endsWith('0')) formatted = formatted.slice(0, -1);
    const price = percent ? '$' + formatted : '$' + base;
    el.innerHTML = percent
      ? '<span class="price-old">$' + base + '</span><span class="price-current">' + price + '</span>' + (periodText ? '<span class="pro-period">' + periodText + '</span>' : '')
      : price + (periodText ? '<span class="pro-period">' + periodText + '</span>' : '');
  });
  document.querySelectorAll('.price-stars[data-base-stars]').forEach(el => {
    const base = Number(el.dataset.baseStars || 0);
    const discounted = Math.round(base * (100 - percent) / 100);
    const formattedBase = base.toLocaleString(appData.lang || 'ru');
    const formattedDiscount = discounted.toLocaleString(appData.lang || 'ru');
    const suffix = el.dataset.baseStars === '7500' ? ' ' + t('annual_stars_suffix') : ' ⭐';
    el.innerHTML = percent
      ? '<span class="price-stars-old">' + t('or_label') + ' ' + formattedBase + suffix + '</span><span class="price-stars-current">' + t('or_label') + ' ' + formattedDiscount + suffix + '</span>'
      : t('or_label') + ' ' + formattedBase + suffix;
  });
}

function updateProFeatureControls(){
  [
    'customCategoryProTag',
    'wallpaperProTag',
    'exportProTag'
  ].forEach(id => {
    const tag = document.getElementById(id);
    if(tag) tag.style.display = canUseProFeatures ? 'none' : 'inline-flex';
  });
}

async function loadPlanStatus(){
  const tg = window.Telegram?.WebApp;
  if(!tg?.initData){
    canUseProFeatures = false;
    // Still render the season countdown and a fallback referral link when Telegram
    // provides the user ID, instead of leaving the UI stuck on "loading".
    renderReferralStats();
    updateProFeatureControls();
    applyWallpaper();
    return;
  }

  try{
    const response = await fetch('/api/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Init-Data': tg.initData
      },
      body: '{}'
    });
    if(!response.ok) throw new Error('Subscription status HTTP ' + response.status);
    const data = await response.json();
    canUseProFeatures = Boolean(data?.features?.pro);
    referralStats = data?.referral || { count: 0, coupons10: 0, coupons20: 0 };
    battlePassStats = data?.battlepass || battlePassStats;
    renderReferralStats();
    updateCouponSelector();
  } catch(error){
    console.error('Could not load subscription access:', error);
    canUseProFeatures = false;
    // Keep referral link + local season countdown visible even if /api/init fails.
    renderReferralStats();
  }

  await syncChatExpenses();
  updateProFeatureControls();
  applyWallpaper();
  renderProInsights();
}

const EXPENSE_CATS = [
  {icon:'🍔',name:'Еда'},{icon:'🛒',name:'Продукты'},{icon:'☕',name:'Кафе'},{icon:'🍕',name:'Фастфуд'},
  {icon:'🚗',name:'Транспорт'},{icon:'🚕',name:'Такси'},{icon:'⛽',name:'Бензин'},{icon:'🚌',name:'Общественный'},
  {icon:'🏠',name:'Дом'},{icon:'💡',name:'Коммуналка'},{icon:'📱',name:'Связь'},{icon:'🌐',name:'Интернет'},
  {icon:'📺',name:'Подписки'},{icon:'💊',name:'Аптека'},{icon:'👕',name:'Одежда'},{icon:'👟',name:'Обувь'},
  {icon:'💇',name:'Красота'},{icon:'🏋️',name:'Спорт'},{icon:'🎬',name:'Кино'},{icon:'🎮',name:'Игры'},
  {icon:'🎉',name:'Досуг'},{icon:'🎁',name:'Подарки'},{icon:'🐾',name:'Питомцы'},{icon:'✈️',name:'Путешествия'},
  {icon:'📚',name:'Образование'},{icon:'🔧',name:'Ремонт'},{icon:'🧴',name:'Хозтовары'},{icon:'💳',name:'Кредит'},
  {icon:'👨‍👧',name:'Алименты'},{icon:'🍷',name:'Алкоголь'},{icon:'🚬',name:'Сигареты'},{icon:'🛍️',name:'Маркетплейсы'},
  {icon:'🏦',name:'Банк/комиссия'},{icon:'📦',name:'Разное'},
  {icon:'🏥',name:'Врачи и лечение'},{icon:'🦷',name:'Стоматолог'},{icon:'🧪',name:'Анализы'},{icon:'🧒',name:'Дети'},
  {icon:'🍼',name:'Детские товары'},{icon:'🏫',name:'Детский сад/школа'},{icon:'🐕',name:'Ветеринар'},{icon:'🧹',name:'Уборка'},
  {icon:'🛏️',name:'Мебель'},{icon:'🔌',name:'Техника'},{icon:'🛠️',name:'Инструменты'},{icon:'🚘',name:'Автообслуживание'},
  {icon:'🅿️',name:'Парковка'},{icon:'🚦',name:'Штрафы'},{icon:'🚆',name:'Билеты'},{icon:'🏨',name:'Отель'},
  {icon:'🍽️',name:'Рестораны'},{icon:'🥤',name:'Напитки'},{icon:'🍰',name:'Сладости'},{icon:'🥦',name:'Овощи и фрукты'},
  {icon:'🥩',name:'Мясо и рыба'},{icon:'🧾',name:'Налоги'},{icon:'⚖️',name:'Юридические услуги'},{icon:'💸',name:'Переводы'},
  {icon:'💰',name:'Снятие наличных'},{icon:'🎟️',name:'Мероприятия'},{icon:'🎨',name:'Хобби'},{icon:'📦',name:'Доставка'},
  {icon:'🧳',name:'Багаж'},{icon:'💍',name:'Украшения'},{icon:'🧥',name:'Аксессуары'},{icon:'🧺',name:'Прачечная'},
  {icon:'🛡️',name:'Страхование'},{icon:'🏛️',name:'Госпошлины'},{icon:'🤲',name:'Благотворительность'},{icon:'🪙',name:'Комиссии и сборы'}
];

const INCOME_CATS = [
  {icon:'💰',name:'Зарплата'},{icon:'💵',name:'Аванс'},{icon:'🏆',name:'Премия'},{icon:'💸',name:'Кэшбэк'},
  {icon:'📈',name:'Инвестиции'},{icon:'📊',name:'Дивиденды'},{icon:'💼',name:'Фриланс'},{icon:'🏪',name:'Бизнес'},
  {icon:'🎯',name:'Продажа'},{icon:'🎁',name:'Подарок'},{icon:'🤝',name:'Помощь'},{icon:'🥇',name:'Выигрыш'},
  {icon:'↩️',name:'Возврат'},{icon:'🎓',name:'Стипендия'},{icon:'👴',name:'Пенсия'},{icon:'🪙',name:'Прочее'},
  {icon:'🏦',name:'Проценты по вкладу'},{icon:'🧑‍💻',name:'Удалённая работа'},{icon:'🧾',name:'Подработка'},{icon:'🏠',name:'Аренда жилья'},
  {icon:'🚗',name:'Аренда имущества'},{icon:'🛒',name:'Возврат покупки'},{icon:'🪙',name:'Продажа криптовалюты'},{icon:'💹',name:'Прибыль от торговли'},
  {icon:'🧑‍🏫',name:'Репетиторство'},{icon:'🧑‍🔧',name:'Услуги и заказы'},{icon:'📦',name:'Продажа вещей'},{icon:'🎨',name:'Творчество и контент'},
  {icon:'📱',name:'Монетизация соцсетей'},{icon:'▶️',name:'Доход от видео'},{icon:'🧑‍🤝‍🧑',name:'Реферальный доход'},{icon:'🌐',name:'Партнёрские программы'},
  {icon:'🧑‍🌾',name:'Сельское хозяйство'},{icon:'🏅',name:'Грант или стипендия'},{icon:'🧓',name:'Социальная помощь'},{icon:'👶',name:'Пособие на ребёнка'},
  {icon:'💒',name:'Наследство'},{icon:'🧳',name:'Компенсация расходов'},{icon:'⚖️',name:'Страховая выплата'},{icon:'🎰',name:'Приз'}
];

const CAT_I18N = {
  'Еда': {en:'Food', uk:'Їжа', de:'Essen', fr:'Nourriture', es:'Comida', it:'Cibo', pl:'Jedzenie', tr:'Yemek', zh:'食物'},
  'Продукты': {en:'Groceries', uk:'Продукти', de:'Lebensmittel', fr:'Courses', es:'Comestibles', it:'Spesa', pl:'Zakupy', tr:'Market', zh:'杂货'},
  'Кафе': {en:'Cafe', uk:'Кафе', de:'Café', fr:'Café', es:'Café', it:'Caffè', pl:'Kawiarnia', tr:'Kafe', zh:'咖啡'},
  'Фастфуд': {en:'Fast food', uk:'Фастфуд', de:'Fastfood', fr:'Fast-food', es:'Comida rápida', it:'Fast food', pl:'Fast food', tr:'Fast food', zh:'快餐'},
  'Транспорт': {en:'Transport', uk:'Транспорт', de:'Transport', fr:'Transport', es:'Transporte', it:'Trasporto', pl:'Transport', tr:'Ulaşım', zh:'交通'},
  'Такси': {en:'Taxi', uk:'Таксі', de:'Taxi', fr:'Taxi', es:'Taxi', it:'Taxi', pl:'Taxi', tr:'Taksi', zh:'出租车'},
  'Бензин': {en:'Fuel', uk:'Бензин', de:'Kraftstoff', fr:'Carburant', es:'Combustible', it:'Carburante', pl:'Paliwo', tr:'Yakıt', zh:'油费'},
  'Общественный': {en:'Public transport', uk:'Громадський', de:'ÖPNV', fr:'Transport public', es:'Transporte público', it:'Trasporto pubblico', pl:'Komunikacja', tr:'Toplu taşıma', zh:'公交'},
  'Дом': {en:'Home', uk:'Дім', de:'Zuhause', fr:'Maison', es:'Casa', it:'Casa', pl:'Dom', tr:'Ev', zh:'家'},
  'Коммуналка': {en:'Utilities', uk:'Комуналка', de:'Nebenkosten', fr:'Charges', es:'Servicios', it:'Bollette', pl:'Rachunki', tr:'Faturalar', zh:'水电'},
  'Связь': {en:'Mobile', uk:'Зв\'язок', de:'Mobilfunk', fr:'Mobile', es:'Móvil', it:'Cellulare', pl:'Telefon', tr:'Telefon', zh:'通信'},
  'Интернет': {en:'Internet', uk:'Інтернет', de:'Internet', fr:'Internet', es:'Internet', it:'Internet', pl:'Internet', tr:'İnternet', zh:'网络'},
  'Подписки': {en:'Subscriptions', uk:'Підписки', de:'Abos', fr:'Abonnements', es:'Suscripciones', it:'Abbonamenti', pl:'Subskrypcje', tr:'Abonelikler', zh:'订阅'},
  'Аптека': {en:'Pharmacy', uk:'Аптека', de:'Apotheke', fr:'Pharmacie', es:'Farmacia', it:'Farmacia', pl:'Apteka', tr:'Eczane', zh:'药房'},
  'Одежда': {en:'Clothes', uk:'Одяг', de:'Kleidung', fr:'Vêtements', es:'Ropa', it:'Vestiti', pl:'Odzież', tr:'Giyim', zh:'服装'},
  'Обувь': {en:'Shoes', uk:'Взуття', de:'Schuhe', fr:'Chaussures', es:'Zapatos', it:'Scarpe', pl:'Buty', tr:'Ayakkabı', zh:'鞋子'},
  'Красота': {en:'Beauty', uk:'Краса', de:'Beauty', fr:'Beauté', es:'Belleza', it:'Bellezza', pl:'Uroda', tr:'Güzellik', zh:'美容'},
  'Спорт': {en:'Sports', uk:'Спорт', de:'Sport', fr:'Sport', es:'Deporte', it:'Sport', pl:'Sport', tr:'Spor', zh:'运动'},
  'Кино': {en:'Cinema', uk:'Кіно', de:'Kino', fr:'Cinéma', es:'Cine', it:'Cinema', pl:'Kino', tr:'Sinema', zh:'电影'},
  'Игры': {en:'Games', uk:'Ігри', de:'Spiele', fr:'Jeux', es:'Juegos', it:'Giochi', pl:'Gry', tr:'Oyun', zh:'游戏'},
  'Досуг': {en:'Leisure', uk:'Дозвілля', de:'Freizeit', fr:'Loisirs', es:'Ocio', it:'Tempo libero', pl:'Rozrywka', tr:'Eğlence', zh:'娱乐'},
  'Подарки': {en:'Gifts', uk:'Подарунки', de:'Geschenke', fr:'Cadeaux', es:'Regalos', it:'Regali', pl:'Prezenty', tr:'Hediyeler', zh:'礼物'},
  'Питомцы': {en:'Pets', uk:'Улюбленці', de:'Haustiere', fr:'Animaux', es:'Mascotas', it:'Animal', pl:'Zwierzęta', tr:'Evcil hayvan', zh:'宠物'},
  'Путешествия': {en:'Travel', uk:'Подорожі', de:'Reisen', fr:'Voyages', es:'Viajes', it:'Viaggi', pl:'Podróże', tr:'Seyahat', zh:'旅行'},
  'Образование': {en:'Education', uk:'Освіта', de:'Bildung', fr:'Éducation', es:'Educación', it:'Istruzione', pl:'Edukacja', tr:'Eğitim', zh:'教育'},
  'Ремонт': {en:'Repairs', uk:'Ремонт', de:'Reparatur', fr:'Réparations', es:'Reparaciones', it:'Riparazioni', pl:'Naprawy', tr:'Tamir', zh:'维修'},
  'Хозтовары': {en:'Household', uk:'Госптовари', de:'Haushalt', fr:'Maison', es:'Hogar', it:'Casa', pl:'Dom', tr:'Ev', zh:'家居'},
  'Кредит': {en:'Loan', uk:'Кредит', de:'Kredit', fr:'Crédit', es:'Crédito', it:'Prestito', pl:'Kredyt', tr:'Kredi', zh:'贷款'},
  'Алименты': {en:'Alimony', uk:'Аліменти', de:'Unterhalt', fr:'Pension', es:'Pensión', it:'Alimenti', pl:'Alimenty', tr:'Nafaka', zh:'抚养费'},
  'Алкоголь': {en:'Alcohol', uk:'Алкоголь', de:'Alkohol', fr:'Alcool', es:'Alcohol', it:'Alcol', pl:'Alkohol', tr:'Alkol', zh:'酒类'},
  'Сигареты': {en:'Cigarettes', uk:'Цигарки', de:'Zigaretten', fr:'Cigarettes', es:'Cigarrillos', it:'Sigarette', pl:'Papierosy', tr:'Sigara', zh:'香烟'},
  'Маркетплейсы': {en:'Marketplaces', uk:'Маркетплейси', de:'Marktplätze', fr:'Marketplaces', es:'Marketplaces', it:'Marketplace', pl:'Marketplace', tr:'Pazaryeri', zh:'电商'},
  'Банк/комиссия': {en:'Bank/Fees', uk:'Банк/комісія', de:'Bank/Gebühren', fr:'Banque/Frais', es:'Banco/Comisiones', it:'Banca/Commissioni', pl:'Bank/Prowizje', tr:'Banka/Komisyon', zh:'银行/手续费'},
  'Разное': {en:'Other', uk:'Різне', de:'Sonstiges', fr:'Divers', es:'Varios', it:'Altro', pl:'Inne', tr:'Diğer', zh:'其他'},
  'Зарплата': {en:'Salary', uk:'Зарплата', de:'Gehalt', fr:'Salaire', es:'Salario', it:'Stipendio', pl:'Wynagrodzenie', tr:'Maaş', zh:'工资'},
  'Аванс': {en:'Advance', uk:'Аванс', de:'Vorschuss', fr:'Avance', es:'Anticipo', it:'Anticipo', pl:'Zaliczka', tr:'Avans', zh:'预支'},
  'Премия': {en:'Bonus', uk:'Премія', de:'Bonus', fr:'Prime', es:'Bono', it:'Bonus', pl:'Premia', tr:'Prim', zh:'奖金'},
  'Кэшбэк': {en:'Cashback', uk:'Кешбек', de:'Cashback', fr:'Cashback', es:'Reembolso', it:'Cashback', pl:'Cashback', tr:'İade', zh:'返现'},
  'Инвестиции': {en:'Investments', uk:'Інвестиції', de:'Investitionen', fr:'Investissements', es:'Inversiones', it:'Investimenti', pl:'Inwestycje', tr:'Yatırımlar', zh:'投资'},
  'Дивиденды': {en:'Dividends', uk:'Дивіденди', de:'Dividenden', fr:'Dividendes', es:'Dividendos', it:'Dividendi', pl:'Dywidendy', tr:'Temettüler', zh:'股息'},
  'Фриланс': {en:'Freelance', uk:'Фріланс', de:'Freelance', fr:'Freelance', es:'Freelance', it:'Freelance', pl:'Freelance', tr:'Serbest', zh:'自由职业'},
  'Бизнес': {en:'Business', uk:'Бізнес', de:'Business', fr:'Affaires', es:'Negocio', it:'Affari', pl:'Biznes', tr:'İş', zh:'生意'},
  'Продажа': {en:'Sale', uk:'Продаж', de:'Verkauf', fr:'Vente', es:'Venta', it:'Vendita', pl:'Sprzedaż', tr:'Satış', zh:'出售'},
  'Подарок': {en:'Gift', uk:'Подарунок', de:'Geschenk', fr:'Cadeau', es:'Regalo', it:'Regalo', pl:'Prezent', tr:'Hediye', zh:'礼物'},
  'Помощь': {en:'Help', uk:'Допомога', de:'Hilfe', fr:'Aide', es:'Ayuda', it:'Aiuto', pl:'Pomoc', tr:'Yardım', zh:'帮助'},
  'Выигрыш': {en:'Win', uk:'Виграш', de:'Gewinn', fr:'Gain', es:'Premio', it:'Vincita', pl:'Wygrana', tr:'Kazanç', zh:'中奖'},
  'Возврат': {en:'Refund', uk:'Повернення', de:'Rückerstattung', fr:'Remboursement', es:'Devolución', it:'Rimborso', pl:'Zwrot', tr:'İade', zh:'退款'},
  'Стипендия': {en:'Scholarship', uk:'Стипендія', de:'Stipendium', fr:'Bourse', es:'Beca', it:'Borsa', pl:'Stypendium', tr:'Burs', zh:'奖学金'},
  'Пенсия': {en:'Pension', uk:'Пенсія', de:'Rente', fr:'Retraite', es:'Pensión', it:'Pensione', pl:'Emerytura', tr:'Emekli', zh:'养老金'},
  'Прочее': {en:'Other', uk:'Інше', de:'Sonstiges', fr:'Autre', es:'Otros', it:'Altro', pl:'Inne', tr:'Diğer', zh:'其他'}
};

function tCat(name){
  if(appData.lang === 'ru' || !appData.lang) return name;
  return (CAT_I18N[name] && CAT_I18N[name][appData.lang]) || name;
}


async function parseTransactionWithAI(){
  const input=document.getElementById('aiTransactionText');
  const status=document.getElementById('aiTransactionStatus');
  const button=document.getElementById('aiTransactionParseBtn');
  const textValue=String(input?.value||'').trim();
  const tg=window.Telegram?.WebApp;
  if(!textValue){if(status)status.textContent='Напиши, например: «потратил 350 грн на продукты».';return;}
  if(!tg?.initData){if(status)status.textContent='Открой приложение через Telegram.';return;}
  if(button){button.disabled=true;button.textContent='Разбираю…';}
  if(status)status.textContent='ИИ разбирает описание…';
  try{
    const response=await fetch('/api/assistant/parse-transaction',{
      method:'POST',
      headers:{'Content-Type':'application/json','X-Init-Data':tg.initData},
      body:JSON.stringify({text:textValue,currency:appData.currency||'UAH'})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.detail||'Не удалось разобрать операцию.');
    refreshAIStatus();
    const draft=data.draft||{};
    if(!Number(draft.amount)||Number(draft.amount)<=0){
      if(status)status.textContent='Не нашёл сумму. Укажи её в тексте, например «кофе 85 грн».';
      return;
    }
    openTransactionModal(draft.type==='income'?'income':'expense');
    const amount=document.getElementById('txAmountInput');
    const title=document.getElementById('txCommentInput');
    const aiInput=document.getElementById('aiTransactionText');
    if(amount)amount.value=String(draft.amount);
    if(title)title.value=String(draft.title||'').slice(0,120);
    if(aiInput)aiInput.value=textValue;
    const grid=document.getElementById('categoryGrid');
    const category=String(draft.category||'').trim().toLocaleLowerCase();
    if(grid&&category){
      const choices=[...grid.querySelectorAll('.icon-item')];
      const match=choices.find(el=>String(el.dataset.name||'').toLocaleLowerCase()===category)
        ||choices.find(el=>String(tCat(el.dataset.name||'')).toLocaleLowerCase()===category)
        ||choices.find(el=>category.includes(String(el.dataset.name||'').toLocaleLowerCase())||String(el.dataset.name||'').toLocaleLowerCase().includes(category));
      if(match)match.click();
    }
    const statusNow=document.getElementById('aiTransactionStatus');
    if(statusNow)statusNow.textContent=(Number(draft.confidence||0)<0.6?'Проверь особенно внимательно: описание неоднозначно. ':'Черновик заполнен. ')+(draft.type==='income'?'Доход':'Расход')+', '+draft.amount+' '+(draft.currency||appData.currency)+'. Нажми «Сохранить» только после проверки.';
  }catch(error){
    if(status)status.textContent=error.message||'Не удалось разобрать операцию.';
  }finally{
    if(button){button.disabled=false;button.textContent='Разобрать';}
  }
}

function openTransactionModal(type) {
  pendingReceiptDraft = null;
  const receiptStatus = document.getElementById('receiptDraftStatus');
  if(receiptStatus) receiptStatus.style.display = 'none';
  appData.activeTxType = type;

  // Очищаем поля при каждом новом открытии
  document.getElementById('txAmountInput').value = '';
  document.getElementById('txCommentInput').value = '';
  const envelopeWrap = document.getElementById('txEnvelopeWrap');
  const envelopeSelect = document.getElementById('txEnvelopeSelect');
  if(envelopeWrap && envelopeSelect){
    envelopeWrap.style.display = type === 'expense' ? 'block' : 'none';
    const availableEnvelopes = budgetMode === 'family' ? familyEnvelopes : (appData.envelopes || []);
    envelopeSelect.innerHTML = '<option value="">Без конверта</option>' + availableEnvelopes.map(e => '<option value="' + e.id + '">' + String(e.name).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</option>').join('');
    envelopeSelect.value = '';
  }

  document.getElementById('txModalTitle').innerText =
    type === 'expense' ? t('btn_expense') : t('btn_income');

  const receiptActions = document.querySelector('.receipt-action-row');
  if(receiptActions) receiptActions.style.display = type === 'expense' ? 'flex' : 'none';
  if(type !== 'expense') pendingReceiptDraft = null;

  const baseCats = type === 'expense' ? EXPENSE_CATS : INCOME_CATS;
  const cats = baseCats.concat(canUseProFeatures ? (appData.customCategories || []) : []);
  const grid = document.getElementById('categoryGrid');

  grid.innerHTML = cats.map((c, i) => `
    <div class="icon-item ${i === 0 ? 'active' : ''}"
         data-name="${c.name}" data-icon="${c.icon}">
      <span class="emoji">${c.icon}</span>
      <span class="name">${tCat(c.name)}</span>
    </div>
  `).join('');

  grid.querySelectorAll('.icon-item').forEach(el => {
    el.onclick = () => {
      grid.querySelectorAll('.icon-item').forEach(item =>
        item.classList.remove('active')
      );

      el.classList.add('active');
      appData.selectedCategory = el.dataset.name;
      appData.currentIcon = el.dataset.icon;
    };
  });

  appData.selectedCategory = cats[0].name;
  appData.currentIcon = cats[0].icon;

  openModal('modalTransaction');
}

function saveCustomCategory(){
  if(!canUseProFeatures){
    requestProFeature('Свои категории');
    closeModal('modalAddCategory');
    return;
  }
  const name = document.getElementById('catCustomName').value.trim();
  const icon = document.getElementById('catCustomEmoji').value.trim() || '📦';
  if(!name) return;
  appData.customCategories.push({ name, icon });
  saveData(); closeModal('modalAddCategory'); openTransactionModal(appData.activeTxType);
}

function txTypeReceiptAllowed(type){ return type === 'expense'; }



function notifyEnvelopeThresholds(envelopeId, spentBefore, addedAmount, envelopeItems){
  if(!envelopeId||!Number.isFinite(Number(addedAmount))||Number(addedAmount)<=0)return;
  const envelope=(envelopeItems||[]).find(item=>String(item.id)===String(envelopeId));
  if(!envelope)return;
  const target=Number(envelope.target||0);
  if(!Number.isFinite(target)||target<=0)return;
  const before=Math.max(0,Number(spentBefore)||0);
  const after=before+Number(addedAmount);
  const thresholds=[60,90,100].filter(percent=>before/target*100<percent&&after/target*100>=percent);
  if(!thresholds.length)return;
  const name=String(envelope.name||'Конверт');
  const lines=thresholds.map(percent=>{
    if(percent===100)return t('envelope_limit_100');
    if(percent===90)return t('envelope_limit_90').replace('{amount}',fmtMoney(Math.max(0,target-after)));
    return t('envelope_limit_60');
  });
  const message=t('envelope_warning_title').replace('{name}',name)+'\n\n'+lines.join('\n')+'\n\n'+t('envelope_spent_summary').replace('{spent}',fmtMoney(after)).replace('{target}',fmtMoney(target));
  const tg=window.Telegram?.WebApp;
  if(tg?.showAlert)tg.showAlert(_localizeDialogMessage(message));
  else alert(message);
}

async function submitTransaction(){
  const amount=parseFloat(document.getElementById('txAmountInput').value);if(!amount||amount<=0)return;
  const title=document.getElementById('txCommentInput').value||tCat(appData.selectedCategory);
  const envelopeSelect=document.getElementById('txEnvelopeSelect');
  const selectedEnvelopeId=appData.activeTxType==='expense'&&envelopeSelect&&envelopeSelect.value?envelopeSelect.value:null;
  if(budgetMode==='family'&&currentFamily){
    const familyEnvelopeItems=familyEnvelopes||[];
    const spentBefore=selectedEnvelopeId&&appData.activeTxType==='expense'
      ?familyTransactions.filter(tx=>tx.type==='expense'&&String(tx.envelopeId||'')===String(selectedEnvelopeId)).reduce((sum,tx)=>sum+Math.max(0,Number(tx.amount)||0),0):0;
    try{
      await familyRequest('/api/family/transactions','POST',{type:appData.activeTxType,amount,title,category:appData.selectedCategory,icon:appData.currentIcon,date:new Date().toISOString(),currency:appData.currency||'UAH',envelopeId:selectedEnvelopeId,receipt:appData.activeTxType==='expense'?pendingReceiptDraft:null});
      closeModal('modalTransaction');pendingReceiptDraft=null;
      await Promise.all([loadFamilyTransactions(),loadFamilyEnvelopes()]);
      if(appData.activeTxType==='expense')notifyEnvelopeThresholds(selectedEnvelopeId,spentBefore,amount,familyEnvelopeItems);
    }catch(e){alert(e.message||'Не удалось сохранить семейную операцию.');}
    return;
  }
  const envelopeId=selectedEnvelopeId?Number(selectedEnvelopeId):null;
  const personalEnvelopeItems=appData.envelopes||[];
  const spentBefore=envelopeId&&appData.activeTxType==='expense'
    ?appData.history.filter(tx=>tx.type==='expense'&&String(tx.envelopeId||'')===String(envelopeId)).reduce((sum,tx)=>sum+Math.max(0,Number(tx.amount)||0),0):0;
  const tx={id:Date.now(),type:appData.activeTxType,title,category:appData.selectedCategory,icon:appData.currentIcon,amount,envelopeId,date:new Date().toLocaleDateString('ru-RU'),receipt:txTypeReceiptAllowed(appData.activeTxType)?pendingReceiptDraft:null};appData.history.unshift(tx);pendingReceiptDraft=null;
  if(tx.type==='expense'){appData.balance-=amount;appData.monthExpense+=amount;}else{appData.balance+=amount;appData.monthIncome+=amount;}
  saveData();closeModal('modalTransaction');renderAll();
  if(tx.type==='expense')notifyEnvelopeThresholds(envelopeId,spentBefore,amount,personalEnvelopeItems);
}

let editingTxId = null;

function txDateForInput(tx){
  const raw=String(tx && tx.date || '').trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(raw))return raw.slice(0,10);
  const ru=raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if(ru)return ru[3]+'-'+String(ru[2]).padStart(2,'0')+'-'+String(ru[1]).padStart(2,'0');
  if(tx && tx.ts){const d=new Date(Number(tx.ts));if(!Number.isNaN(d.getTime()))return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  return new Date().toISOString().slice(0,10);
}

function openTxEditor(id){
  const list=budgetMode==='family'&&currentFamily?familyTransactions:appData.history;
  const tx=list.find(item=>String(item.id)===String(id));
  if(!tx)return;
  editingTxId=id;
  document.getElementById('editTxType').value=tx.type==='income'?'income':'expense';
  document.getElementById('editTxAmount').value=Number(tx.amount||0);
  document.getElementById('editTxTitle').value=tx.title||tx.note||tx.category||'Операция';
  document.getElementById('editTxCategory').value=tx.category||'Разное';
  document.getElementById('editTxDate').value=txDateForInput(tx);
  const select=document.getElementById('editTxEnvelope');
  const envelopes=budgetMode==='family'&&currentFamily?familyEnvelopes:(appData.envelopes||[]);
  select.innerHTML='<option value="">Без конверта</option>'+envelopes.map(e=>'<option value="'+bankEscape(e.id)+'">'+bankEscape(e.name)+'</option>').join('');
  select.value=tx.envelopeId==null?'':String(tx.envelopeId);
  select.disabled=document.getElementById('editTxType').value!=='expense';
  document.getElementById('editTxType').onchange=()=>{select.disabled=document.getElementById('editTxType').value!=='expense';if(select.disabled)select.value='';};
  const error=document.getElementById('editTxError');if(error)error.textContent='';
  openModal('modalEditTransaction');
}

function isTransactionInCurrentMonth(tx,dateOverride){
  let d=null;
  if(dateOverride){d=new Date(dateOverride+'T12:00:00');}
  else{
    const raw=String(tx && tx.date || '');
    if(/^\d{4}-\d{2}-\d{2}/.test(raw))d=new Date(raw.slice(0,10)+'T12:00:00');
    else {const m=raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);if(m)d=new Date(Number(m[3]),Number(m[2])-1,Number(m[1]));}
    if((!d||Number.isNaN(d.getTime()))&&tx&&tx.ts)d=new Date(Number(tx.ts));
  }
  if(!d||Number.isNaN(d.getTime()))return false;
  const now=new Date();return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();
}

async function saveTxEdits(){
  if(editingTxId===null)return;
  const type=document.getElementById('editTxType').value;
  const amount=Number(document.getElementById('editTxAmount').value);
  const title=document.getElementById('editTxTitle').value.trim();
  const category=document.getElementById('editTxCategory').value.trim()||'Разное';
  const date=document.getElementById('editTxDate').value;
  const envelopeSelect=document.getElementById('editTxEnvelope');
  const envelopeId=type==='expense'?(envelopeSelect.value||''):'';
  const error=document.getElementById('editTxError');
  if(!['income','expense'].includes(type)||!Number.isFinite(amount)||amount<=0||!title||!date){if(error)error.textContent='Проверь тип, сумму, описание и дату операции.';return;}
  const familyMode=budgetMode==='family'&&currentFamily;
  const list=familyMode?familyTransactions:appData.history;
  const tx=list.find(item=>String(item.id)===String(editingTxId));
  if(!tx){if(error)error.textContent=receiptUi('notFound');return;}
  const old={type:tx.type,amount:Number(tx.amount||0)};
  const icon=bankCategoryIcon(category,type);
  try{
    if(familyMode){
      await familyRequest('/api/family/transactions/'+encodeURIComponent(String(editingTxId)),'PATCH',{type,amount,title,category,icon,date,envelopeId,currency:tx.currency||appData.currency});
      await loadFamilyTransactions();
      await loadFamilyEnvelopes();
    }else{
      const oldImpact=(old.type==='income'?1:-1)*old.amount;
      const newImpact=(type==='income'?1:-1)*amount;
      appData.balance=Number(appData.balance||0)-oldImpact+newImpact;
      if(isTransactionInCurrentMonth(tx)){
        if(old.type==='income')appData.monthIncome-=old.amount;else appData.monthExpense-=old.amount;
      }
      if(isTransactionInCurrentMonth(tx,date)){
        if(type==='income')appData.monthIncome+=amount;else appData.monthExpense+=amount;
      }
      tx.type=type;tx.amount=amount;tx.title=title;tx.note=title;tx.category=category;tx.icon=icon;
      tx.date=date.split('-').reverse().join('.');tx.ts=new Date(date+'T12:00:00').getTime();tx.envelopeId=envelopeId||null;
      saveData();renderAll();
    }
    editingTxId=null;closeModal('modalEditTransaction');
  }catch(e){if(error)error.textContent=e.message||'Не удалось сохранить операцию.';}
}

async function deleteTx(id){
  if(budgetMode==='family' && currentFamily){
    const tx = familyTransactions.find(item => String(item.id) === String(id));
    if(!tx) return;
    if(!window.confirm('Удалить эту семейную операцию?')) return;
    try{
      await familyRequest('/api/family/transactions/' + encodeURIComponent(String(id)), 'DELETE');
      familyTransactions = familyTransactions.filter(item => String(item.id) !== String(id));
      renderAll();
      familyFeedback('Операция удалена.');
    }catch(error){
      familyFeedback(error.message || 'Не удалось удалить операцию.', true);
    }
    return;
  }
  const tx = appData.history.find(x => String(x.id) === String(id));
  if(!tx) return;
  if(!window.confirm('Удалить эту операцию?')) return;
  if(tx.type === 'expense'){ appData.balance += Number(tx.amount||0); }
  else { appData.balance -= Number(tx.amount||0); }
  if(isTransactionInCurrentMonth(tx)){
    if(tx.type === 'expense') appData.monthExpense -= Number(tx.amount||0);
    else appData.monthIncome -= Number(tx.amount||0);
  }
  appData.history = appData.history.filter(x => String(x.id) !== String(id));
  saveData(); renderAll();
}

function openEnvelopeEditor(id){
  const list=budgetMode==='family'&&currentFamily?familyEnvelopes:appData.envelopes;
  const item=list.find(x=>String(x.id)===String(id)); if(!item)return;
  editingEnvelopeId=id;
  document.getElementById('envNameInput').value=item.name||'';
  document.getElementById('envTargetInput').value=item.target||'';
  const title=document.querySelector('#modalAddEnvelope .modal-header h3'); if(title)title.textContent='Изменить конверт';
  const btn=document.querySelector('#modalAddEnvelope button[onclick="saveEnvelope()"]'); if(btn)btn.textContent='Сохранить изменения';
  openModal('modalAddEnvelope');
}

async function deleteEnvelope(id){
  const list=budgetMode==='family'&&currentFamily?familyEnvelopes:appData.envelopes;
  const item=list.find(x=>String(x.id)===String(id));if(!item)return;
  if(!window.confirm(t('dialog_delete_envelope').replace('{name}',String(item.name||''))))return;
  try{
    if(budgetMode==='family'&&currentFamily){
      await familyRequest('/api/family/envelopes/'+encodeURIComponent(String(id)),'DELETE');
      familyEnvelopes=familyEnvelopes.filter(x=>String(x.id)!==String(id));
      familyTransactions.forEach(tx=>{if(String(tx.envelopeId||'')===String(id))tx.envelopeId='';});
      renderAll();
    }else{
      appData.envelopes=appData.envelopes.filter(x=>String(x.id)!==String(id));
      appData.history.forEach(tx=>{if(String(tx.envelopeId||'')===String(id))tx.envelopeId=null;});
      saveData();renderAll();
    }
  }catch(e){alert(e.message||'Не удалось удалить конверт.');}
}

async function saveEnvelope(){
  const name = document.getElementById('envNameInput').value.trim();
  const target = parseFloat(document.getElementById('envTargetInput').value);
  if(!name || !Number.isFinite(target) || target <= 0) return;
  if(budgetMode==='family'&&currentFamily){
    try{if(editingEnvelopeId!==null){await familyRequest('/api/family/envelopes/'+encodeURIComponent(String(editingEnvelopeId)),'PATCH',{name,target});editingEnvelopeId=null;}else{await familyRequest('/api/family/envelopes','POST',{name,target});}document.getElementById('envNameInput').value='';document.getElementById('envTargetInput').value='';closeModal('modalAddEnvelope');const envTitle=document.querySelector('#modalAddEnvelope .modal-header h3');if(envTitle)envTitle.textContent='Новый конверт';const envBtn=document.querySelector('#modalAddEnvelope button[onclick="saveEnvelope()"]');if(envBtn)envBtn.textContent='Создать';await loadFamilyEnvelopes();}
    catch(e){alert(e.message||'Не удалось создать семейный конверт.');}
    return;
  }
  if(editingEnvelopeId!==null){
    const item=appData.envelopes.find(x=>String(x.id)===String(editingEnvelopeId));
    if(item){item.name=name;item.target=target;} editingEnvelopeId=null;
  }else appData.envelopes.push({ id: Date.now(), name, target });
  document.getElementById('envNameInput').value='';document.getElementById('envTargetInput').value='';
  const envTitle=document.querySelector('#modalAddEnvelope .modal-header h3');if(envTitle)envTitle.textContent='Новый конверт';
  const envBtn=document.querySelector('#modalAddEnvelope button[onclick="saveEnvelope()"]');if(envBtn)envBtn.textContent='Создать';
  saveData(); closeModal('modalAddEnvelope'); renderAll();
}

function openBankEditor(id){
  const bankItems=budgetMode==='family'&&currentFamily?familyBanks:appData.banks;
  const item=bankItems.find(x=>String(x.id)===String(id));if(!item)return;
  editingBankId=id;
  document.getElementById('bankNameInput').value=item.name||'';
  document.getElementById('bankTargetInput').value=item.target||'';
  document.getElementById('bankDeadlineInput').value=item.deadline||'';
  const title=document.querySelector('#modalAddBank .modal-header h3');if(title)title.textContent='Изменить копилку';
  const btn=document.querySelector('#modalAddBank button[onclick="saveBank()"]');if(btn)btn.textContent='Сохранить изменения';
  openModal('modalAddBank');
}
async function deleteBank(id){
  const familyMode=budgetMode==='family'&&currentFamily;
  const bankItems=familyMode?familyBanks:appData.banks;
  const item=bankItems.find(x=>String(x.id)===String(id));if(!item)return;
  if(!window.confirm(t('dialog_delete_bank').replace('{name}',String(item.name||''))))return;
  try{
    if(familyMode){
      await familyRequest('/api/family/banks/'+encodeURIComponent(String(id)),'DELETE');
      familyBanks=familyBanks.filter(x=>String(x.id)!==String(id));
    }else appData.banks=appData.banks.filter(x=>String(x.id)!==String(id));
    if(String(selectedBankIdForContribution)===String(id))selectedBankIdForContribution=null;
    if(!familyMode)saveData();
    renderAll();
  }catch(e){alert(e.message||'Не удалось удалить копилку.');}
}

async function saveBank(){
  const name = document.getElementById('bankNameInput').value.trim();
  const target = parseFloat(document.getElementById('bankTargetInput').value);
  const deadline = document.getElementById('bankDeadlineInput').value || null;
  if(!name || !Number.isFinite(target) || target <= 0){alert('Укажи название и цель больше нуля.');return;}
  const familyMode=budgetMode==='family'&&currentFamily;
  try{
    if(familyMode){
      if(editingBankId!==null){
        await familyRequest('/api/family/banks/'+encodeURIComponent(String(editingBankId)),'PATCH',{name,target,deadline});
      }else{
        await familyRequest('/api/family/banks','POST',{name,target,deadline});
      }
      editingBankId=null;
      await loadFamilyBanks();
    }else{
      if(editingBankId!==null){
        const bank=appData.banks.find(item=>String(item.id)===String(editingBankId));
        if(bank){bank.name=name;bank.target=target;bank.deadline=deadline;}
        editingBankId=null;
      }else appData.banks.push({ id: Date.now(), name, target, balance: 0, deadline });
      saveData();
    }
    document.getElementById('bankNameInput').value='';
    document.getElementById('bankTargetInput').value='';
    document.getElementById('bankDeadlineInput').value='';
    const bankTitle=document.querySelector('#modalAddBank .modal-header h3');if(bankTitle)bankTitle.textContent='Новая банка';
    const bankBtn=document.querySelector('#modalAddBank button[onclick="saveBank()"]');if(bankBtn)bankBtn.textContent='Создать';
    closeModal('modalAddBank');renderAll();
  }catch(e){alert(e.message||'Не удалось сохранить копилку.');}
}

let selectedBankIdForContribution = null;
function contributeToBank(id){
  const familyMode=budgetMode==='family'&&currentFamily;
  const bank=(familyMode?familyBanks:appData.banks).find(item=>String(item.id)===String(id));
  if(!bank)return;
  selectedBankIdForContribution=bank.id;
  document.getElementById('bankContributionTitle').textContent='Пополнить: '+bank.name;
  document.getElementById('bankContributionAmount').value='';
  document.getElementById('bankContributionHint').textContent=(familyMode?'Доступно на семейном балансе: ':'Доступно на личном балансе: ')+fmtMoney(familyMode?getVisibleBudget().balance:appData.balance);
  openModal('modalBankContribution');
}
async function saveBankContribution(){
  const familyMode=budgetMode==='family'&&currentFamily;
  const bankItems=familyMode?familyBanks:appData.banks;
  const bank=bankItems.find(item=>String(item.id)===String(selectedBankIdForContribution));
  const amount=Number(document.getElementById('bankContributionAmount').value);
  const available=familyMode?getVisibleBudget().balance:Number(appData.balance||0);
  if(!bank||!Number.isFinite(amount)||amount<=0){alert('Введи сумму больше нуля.');return;}
  if(amount>available){alert('На доступном балансе недостаточно денег.');return;}
  try{
    const oldBalance=Number(bank.balance||0);
    const target=Number(bank.target||0);
    let newBalance;
    if(familyMode){
      const result=await familyRequest('/api/family/banks/'+encodeURIComponent(String(bank.id))+'/contributions','POST',{amount,currency:appData.currency||'UAH'});
      newBalance=Number(result.balance);
      await Promise.all([loadFamilyBanks(),loadFamilyTransactions()]);
    }else{
      appData.balance-=amount;
      bank.balance=oldBalance+amount;
      newBalance=bank.balance;
      bank.contributions=Array.isArray(bank.contributions)?bank.contributions:[];
      bank.contributions.push({amount,date:new Date().toLocaleDateString('ru-RU')});
      saveData();
    }
    selectedBankIdForContribution=null;closeModal('modalBankContribution');renderAll();
    if(target>0&&oldBalance<target&&newBalance>=target){
      alert(t('goal_achieved_message').replace('{name}',String(bank.name||'')).replace('{saved}',fmtMoney(newBalance)).replace('{target}',fmtMoney(target)));
    }
  }catch(e){alert(e.message||'Не удалось пополнить копилку.');}
}

function ensureRecurringIds(){
  if(!Array.isArray(appData.recurring))appData.recurring=[];
  let changed=false;
  appData.recurring.forEach(item=>{
    if(!item.id){item.id=String(Date.now())+'_'+Math.random().toString(36).slice(2,9);changed=true;}
  });
  if(changed)saveData();
  return appData.recurring;
}

async function syncPaymentReminders(){
  const tg=window.Telegram?.WebApp;
  if(!tg?.initData)return;
  const recurring=ensureRecurringIds().map(item=>({
    id:String(item.id),name:String(item.name||'').slice(0,100),
    amount:Number(item.amount)||0,day:Math.min(31,Math.max(1,parseInt(item.day)||1)),
    currency:String((CURRENCIES.find(c=>c.id===appData.currency)||{}).sym||appData.currency||''),lang:String(appData.lang||'en')
  }));
  try{
    const response=await fetch('/api/payment-reminders',{
      method:'PUT',
      headers:{'Content-Type':'application/json','X-Init-Data':tg.initData},
      body:JSON.stringify({items:recurring})
    });
    if(!response.ok)throw new Error('HTTP '+response.status);
  }catch(error){console.warn('Не удалось синхронизировать напоминания об автоплатежах:',error);}
}

function saveRecurring(){
  const name=document.getElementById('recName').value.trim();
  const amount=Number(document.getElementById('recAmount').value);
  const day=Number.parseInt(document.getElementById('recDay').value,10);
  if(!name){alert(t('invalid_payment_name'));return;}
  if(!Number.isFinite(amount)||amount<=0){alert(t('invalid_payment_amount'));return;}
  if(!Number.isInteger(day)||day<1||day>31){alert(t('invalid_payment_day'));return;}
  ensureRecurringIds().push({id:String(Date.now())+'_'+Math.random().toString(36).slice(2,9),name,amount,day,lastRun:''});
  saveData();closeModal('modalAddRecurring');
  document.getElementById('recName').value='';
  document.getElementById('recAmount').value='';
  document.getElementById('recDay').value='';
  renderAll();
  syncPaymentReminders();
}

function deleteRecurring(id){
  const items=ensureRecurringIds();
  const item=items.find(entry=>String(entry.id)===String(id));
  if(!item||!confirm(t('delete_payment_confirm').replace('{name}',String(item.name||'').replace(/[<>]/g,''))))return;
  appData.recurring=items.filter(entry=>String(entry.id)!==String(id));
  saveData();renderAll();syncPaymentReminders();
}

async function exportCSV() {
  if(!canUseProFeatures){
    requestProFeature('Экспорт Excel');
    return;
  }
  const tg = window.Telegram?.WebApp;

  if (!tg?.initData) {
    alert('Открой приложение через Telegram.');
    return;
  }

  try {
    const response = await fetch('/api/export', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Init-Data': tg.initData
      },
      body: JSON.stringify({
        transactions: getVisibleBudget().history,
        currency: appData.currency,
        mode: budgetMode
      })
    });

    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.detail || 'Ошибка экспорта');
    }

    showExportToast('Excel-файл отправлен в Telegram');
  } catch (error) {
    console.error('Export error:', error);
    tg?.showAlert?.(
      'Не удалось экспортировать файл. Попробуй ещё раз.'
    );
  }
}
function openPicker(kind){
  const cfg = { language: { title:t('lang'), items: LANGS }, currency: { title:t('currency'), items: CURRENCIES } }[kind];
  document.getElementById('pickerTitle').innerText = cfg.title;
  const cur = kind === 'language' ? appData.lang : appData.currency;
  document.getElementById('pickerList').innerHTML = cfg.items.map(it => `
    <div class="picker-item ${String(it.id)===String(cur)?'active':''}" onclick="pick('${kind}','${it.id}')">
      ${it.flag ? `<span class="flag">${it.flag}</span>` : ''}
      ${it.sym ? `<span class="sym">${it.sym}</span>` : ''}
      <span>${kind === 'currency' ? tCurrency(it.id) : it.label}</span>
      <i class="fa-solid fa-check check"></i>
    </div>`).join('');
  openModal('modalPicker');
}

function pick(kind, id){
  if(kind==='language') { appData.lang = id; applyLang(); }
  if(kind==='currency') appData.currency = id;
  saveData(); closeModal('modalPicker'); renderAll();
}

function setTheme(mode){
  appData.theme = mode; saveData();
    document.documentElement.dataset.theme = mode;
  document.querySelectorAll('[data-theme-btn]').forEach(b => {
    b.classList.toggle('active', b.dataset.themeBtn === mode);
  });
}

function onWallpaperPicked(ev){
  if(!canUseProFeatures){
    ev.target.value = '';
    requestProFeature('Персональные обои');
    return;
  }
  const file = ev.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    appData.wallpaper = e.target.result;
    saveData();
    applyWallpaper();
  };
  reader.readAsDataURL(file);
}

function clearWallpaper(){
  appData.wallpaper = null;
  saveData();
  applyWallpaper();
}

function applyWallpaper(){
  if(canUseProFeatures && appData.wallpaper){
    document.body.classList.add('has-wallpaper');
    document.body.style.backgroundImage = `url(${appData.wallpaper})`;
  } else {
    document.body.classList.remove('has-wallpaper');
    document.body.style.backgroundImage = '';
  }
}

let currentFamily = null;
let familyBusy = false;
let familyTransactions = [];
let familyEnvelopes = [];
let familyBanks = [];
let familyBanksBusy = false;
let familyEnvelopesBusy = false;
let familyTransactionsBusy = false;
let budgetMode = 'personal'; // Always open on the personal budget; family mode is selected explicitly.
function updateBudgetModeControls(){
 const sw=document.getElementById('budgetModeSwitch'); if(sw)sw.style.display=currentFamily?'flex':'none';
 const p=document.getElementById('budgetModePersonal'),f=document.getElementById('budgetModeFamily');
 if(p)p.classList.toggle('active',budgetMode==='personal');if(f)f.classList.toggle('active',budgetMode==='family');
 if(!currentFamily&&budgetMode==='family'){budgetMode='personal';localStorage.setItem('budgetMode_'+telegramUserId,'personal');}
}
async function setBudgetMode(mode){
  if(!['personal','family'].includes(mode))return;
  if(mode==='family'&&!currentFamily){
    await loadFamilyStatus();
    if(!currentFamily){
      familyFeedback('Сначала создай семейную группу или присоединись к ней.',true);
      return;
    }
  }
  budgetMode=mode;
  localStorage.setItem('budgetMode_'+telegramUserId,mode);
  updateBudgetModeControls();
  renderAll();
  if(mode==='family'){
    await Promise.all([loadFamilyTransactions(),loadFamilyEnvelopes(),loadFamilyBanks()]);
  }
  renderAll();
}
function refreshFamilyData(){
 if(!currentFamily)return;
 return Promise.all([loadFamilyTransactions(),loadFamilyEnvelopes(),loadFamilyBanks()]);
}
async function loadFamilyTransactions(){if(!currentFamily||familyTransactionsBusy)return;familyTransactionsBusy=true;try{const r=await familyRequest('/api/family/transactions');familyTransactions=Array.isArray(r.transactions)?r.transactions:[];}catch(e){familyFeedback(e.message||'Не удалось загрузить семейные операции.',true);}finally{familyTransactionsBusy=false;renderAll();}}
async function loadFamilyEnvelopes(){if(!currentFamily||familyEnvelopesBusy)return;familyEnvelopesBusy=true;try{const r=await familyRequest('/api/family/envelopes');familyEnvelopes=Array.isArray(r.envelopes)?r.envelopes:[];}catch(e){familyFeedback(e.message||'Не удалось загрузить семейные конверты.',true);}finally{familyEnvelopesBusy=false;renderAll();}}
async function loadFamilyBanks(){if(!currentFamily||familyBanksBusy)return;familyBanksBusy=true;try{const r=await familyRequest('/api/family/banks');familyBanks=Array.isArray(r.banks)?r.banks:[];}catch(e){familyFeedback(e.message||'Не удалось загрузить семейные копилки.',true);}finally{familyBanksBusy=false;renderAll();}}
function getVisibleBudget(){
 if(budgetMode!=='family'||!currentFamily)return {balance:appData.balance,monthIncome:appData.monthIncome,monthExpense:appData.monthExpense,history:appData.history,isFamily:false};
 const now=new Date(),history=familyTransactions.map(tx=>({...tx,title:tx.title||tx.note||tx.category||'Операция',date:tx.date||(tx.ts?new Date(Number(tx.ts)).toLocaleDateString('ru-RU'):'')}));
 const month=history.filter(tx=>{const d=tx.ts?new Date(Number(tx.ts)):new Date(tx.date||'');return !isNaN(d)&&d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();});
 const income=month.filter(tx=>tx.type==='income').reduce((s,tx)=>s+Number(tx.amount||0),0),expense=month.filter(tx=>tx.type==='expense').reduce((s,tx)=>s+Number(tx.amount||0),0);
 const balance=history.reduce((s,tx)=>s+(tx.type==='income'?1:-1)*Number(tx.amount||0),0);
 return {balance,monthIncome:income,monthExpense:expense,history,isFamily:true};
}

function familyRequest(path, method='GET', body=null){
  const tg = window.Telegram?.WebApp;
  if(!tg?.initData){
    return Promise.reject(new Error('Открой «Семейный бюджет» через Telegram, чтобы управлять семьёй.'));
  }
  const options = {
    method,
    headers: {'X-Init-Data': tg.initData}
  };
  if(body !== null){
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  return fetch(path, options).then(async response => {
    const data = await response.json().catch(() => ({}));
    if(!response.ok){
      const error = new Error(data.detail || 'Не удалось выполнить запрос.');
      error.status = response.status;
      throw error;
    }
    return data;
  });
}

function familyFeedback(message, isError=false){
  const node = document.getElementById('familyFeedback');
  if(!node) return;
  node.textContent = message || '';
  node.classList.toggle('is-error', Boolean(isError));
}

function setFamilyBusy(busy){
  familyBusy = busy;
  ['familyCreateSubmit','familyJoinSubmit','familyCreateBtn','familyJoinBtn','familyLeaveBtn']
    .forEach(id => {
      const node = document.getElementById(id);
      if(node) node.disabled = busy;
    });
}

function hideFamilyForms(){
  const createForm = document.getElementById('familyCreateForm');
  const joinForm = document.getElementById('familyJoinForm');
  const actions = document.getElementById('familyActionButtons');
  if(createForm) createForm.style.display = 'none';
  if(joinForm) joinForm.style.display = 'none';
  if(actions) actions.style.display = currentFamily ? 'none' : 'grid';
}

function showFamilyCreateForm(){
  if(familyBusy) return;
  if(!canUseProFeatures){requestProFeature('Создание семейного бюджета');return;}
  familyFeedback('');
  const createForm = document.getElementById('familyCreateForm');
  const joinForm = document.getElementById('familyJoinForm');
  const actions = document.getElementById('familyActionButtons');
  if(createForm) createForm.style.display = 'block';
  if(joinForm) joinForm.style.display = 'none';
  if(actions) actions.style.display = 'none';
  document.getElementById('familyCreateName')?.focus();
}

function showFamilyJoinForm(){
  if(familyBusy) return;
  familyFeedback('');
  const createForm = document.getElementById('familyCreateForm');
  const joinForm = document.getElementById('familyJoinForm');
  const actions = document.getElementById('familyActionButtons');
  if(createForm) createForm.style.display = 'none';
  if(joinForm) joinForm.style.display = 'block';
  if(actions) actions.style.display = 'none';
  document.getElementById('familyInviteCode')?.focus();
}

function cancelFamilyForms(){
  if(familyBusy) return;
  hideFamilyForms();
  familyFeedback('');
}

function renderFamilyStatus(family){
  currentFamily = family || null;
  updateBudgetModeControls();
  if(currentFamily){loadFamilyEnvelopes();loadFamilyBanks();if(budgetMode==='family')loadFamilyTransactions();}
  const status = document.getElementById('familyStatus');
  const currentInfo = document.getElementById('familyCurrentInfo');
  const emptyInfo = document.getElementById('familyEmptyInfo');
  const actions = document.getElementById('familyActionButtons');
  const leaveBtn = document.getElementById('familyLeaveBtn');

  if(!family){
    if(status) status.textContent = t('src_family_empty');
    if(currentInfo) currentInfo.style.display = 'none';
    if(emptyInfo) emptyInfo.style.display = 'block';
    if(actions) actions.style.display = 'grid';
    if(leaveBtn) leaveBtn.style.display = 'none';
    hideFamilyForms();
    return;
  }

  const members = family.members && typeof family.members === 'object'
    ? family.members : {};
  if(status) status.textContent = t('src_family_active');
  if(currentInfo) currentInfo.style.display = 'block';
  if(emptyInfo) emptyInfo.style.display = 'none';
  if(actions) actions.style.display = 'none';
  if(leaveBtn) leaveBtn.style.display = 'block';
  const nameNode = document.getElementById('familyNameText');
  const codeNode = document.getElementById('familyCodeText');
  const countNode = document.getElementById('familyMembersCount');
  if(nameNode) nameNode.textContent = family.name || 'Моя семья';
  if(codeNode) codeNode.textContent = family.id || '';
  if(countNode){
    const count = Object.keys(members).length;
    countNode.textContent = t('src_family_members').replace('{count}',String(count)).replace('{role}',family.currentRole === 'owner' ? t('src_family_owner') : '');
  }
  hideFamilyForms();
}

async function loadFamilyStatus(){
  const status = document.getElementById('familyStatus');
  if(status) status.textContent = 'Проверяем семейную группу…';
  try{
    const family = await familyRequest('/api/family');
    renderFamilyStatus(family);
  } catch(error){
    if(error.status === 404 && error.message === 'no family'){
      renderFamilyStatus(null);
      return;
    }
    if(status) status.textContent = error.message || 'Не удалось загрузить семейную группу.';
    const actions = document.getElementById('familyActionButtons');
    if(actions) actions.style.display = 'grid';
    familyFeedback('Проверь подключение и открой приложение из Telegram.', true);
  }
}

async function createFamily(){
  if(familyBusy) return;
  const input = document.getElementById('familyCreateName');
  const name = (input?.value || '').trim();
  setFamilyBusy(true);
  familyFeedback('Создаём семейную группу…');
  try{
    const result = await familyRequest('/api/family/create', 'POST', {name});
    renderFamilyStatus(result.family);
    if(input) input.value = '';
    familyFeedback('Семья создана! Передай близким код приглашения.');
  } catch(error){
    familyFeedback(error.message || 'Не удалось создать семью.', true);
  } finally {
    setFamilyBusy(false);
  }
}

async function joinFamily(){
  if(familyBusy) return;
  const input = document.getElementById('familyInviteCode');
  const code = (input?.value || '').replace(/\s+/g, '').toUpperCase();
  if(!code){
    familyFeedback('Введи код приглашения.', true);
    return;
  }
  setFamilyBusy(true);
  familyFeedback('Проверяем код приглашения…');
  try{
    const result = await familyRequest('/api/family/join', 'POST', {code});
    renderFamilyStatus(result.family);
    if(input) input.value = '';
    familyFeedback('Готово! Ты присоединился к семейной группе.');
  } catch(error){
    familyFeedback(error.message || 'Не удалось присоединиться к семье.', true);
  } finally {
    setFamilyBusy(false);
  }
}

async function copyReferralLink(){
  const link = referralStats.link || document.getElementById('referralLinkInput')?.value || '';
  if(!link) return;
  try{
    await navigator.clipboard.writeText(link);
    const tg = window.Telegram?.WebApp;
    if(tg?.showAlert) tg.showAlert(_localizeDialogMessage('Реферальная ссылка скопирована!'));
    else alert('Реферальная ссылка скопирована!');
  } catch(error){
    const input = document.getElementById('referralLinkInput');
    if(input){ input.focus(); input.select(); }
    const tg = window.Telegram?.WebApp;
    if(tg?.showAlert) tg.showAlert(_localizeDialogMessage('Не удалось скопировать автоматически. Выдели ссылку и скопируй её вручную.'));
    else alert('Не удалось скопировать автоматически. Выдели ссылку и скопируй её вручную.');
  }
}

async function copyFamilyCode(){
  const code = currentFamily?.id;
  if(!code) return;
  try{
    await navigator.clipboard.writeText(code);
    familyFeedback(t('family_code_copied').replace('{code}',String(code)));
  } catch(error){
    familyFeedback('Не удалось скопировать автоматически. Код: ' + code, true);
  }
}

async function leaveFamily(){
  if(familyBusy || !currentFamily) return;
  const name = currentFamily.name || t('family');
  const confirmed = confirm(t('dialog_leave_family').replace('{name}',name));
  if(!confirmed) return;

  setFamilyBusy(true);
  familyFeedback('Выполняем выход из семейной группы…');
  try{
    await familyRequest('/api/family/leave', 'POST', {});
    renderFamilyStatus(null);
    familyFeedback('Ты вышел из семьи. Личные финансовые записи сохранены.');
  } catch(error){
    familyFeedback(error.message || 'Не удалось выйти из семьи.', true);
  } finally {
    setFamilyBusy(false);
    await loadFamilyStatus();
  }
}

let chart1, chart2;

function renderCharts(){
  if(typeof Chart === 'undefined') return;

  const expensesCanvas = document.getElementById('expensesChart');
  const monthsCanvas = document.getElementById('monthsChart');
  if(!expensesCanvas || !monthsCanvas) return;

  const textColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--text').trim() || '#f5f7ff';
  const gridColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--border').trim() || 'rgba(150,160,190,.2)';

  if(chart1) chart1.destroy();
  if(chart2) chart2.destroy();

  const categories = {};
  appData.history.filter(tx => tx.type === 'expense').forEach(tx => {
    const key = tx.category || 'Разное';
    categories[key] = (categories[key] || 0) + Number(tx.amount || 0);
  });

  const palette = [
    '#8b7cff','#36d9ff','#36d6a0','#ff6685','#ffc96b',
    '#ff9f6e','#9b8cff','#53b7ff','#d17cff','#72d6bd'
  ];

  chart1 = new Chart(expensesCanvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: Object.keys(categories).map(tCat),
      datasets: [{
        data: Object.values(categories),
        backgroundColor: Object.keys(categories).map((_,i) => palette[i % palette.length]),
        borderColor: getComputedStyle(document.documentElement)
          .getPropertyValue('--surface-strong').trim() || '#13192e',
        borderWidth: 3,
        hoverOffset: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: textColor, padding: 14, usePointStyle: true }
        },
        title: {
          display: true,
          text: t('expense'),
          color: textColor,
          padding: { bottom: 16 }
        }
      }
    }
  });

  const monthKeys = [];
  const monthLabels = [];
  const now = new Date();

  for(let i = 5; i >= 0; i--){
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push(
      `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    );
    monthLabels.push(
      d.toLocaleDateString(appData.lang || 'ru', { month: 'short' })
    );
  }

  const incomes = Object.fromEntries(monthKeys.map(k => [k, 0]));
  const expenses = Object.fromEntries(monthKeys.map(k => [k, 0]));

  appData.history.forEach(tx => {
    const parts = String(tx.date || '').split('.');
    if(parts.length !== 3) return;

    const key = `${parts[2]}-${String(parts[1]).padStart(2,'0')}`;
    if(!(key in incomes)) return;

    if(tx.type === 'income'){
      incomes[key] += Number(tx.amount || 0);
    } else {
      expenses[key] += Number(tx.amount || 0);
    }
  });

  chart2 = new Chart(monthsCanvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: monthLabels,
      datasets: [
        {
          label: t('income'),
          data: monthKeys.map(k => incomes[k]),
          borderColor: '#36d6a0',
          backgroundColor: 'rgba(54,214,160,.13)',
          fill: true,
          tension: .35,
          pointRadius: 3
        },
        {
          label: t('expense'),
          data: monthKeys.map(k => expenses[k]),
          borderColor: '#ff6685',
          backgroundColor: 'rgba(255,102,133,.10)',
          fill: true,
          tension: .35,
          pointRadius: 3
        }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: textColor, usePointStyle: true }
        },
        title: {
          display: true,
          text: `${t('income')} / ${t('expense')} — ${t('за 6 месяцев')}`,
          color: textColor
        }
      },
      scales: {
        x: {
          ticks: { color: textColor },
          grid: { color: gridColor }
        },
        y: {
          beginAtZero: true,
          ticks: { color: textColor },
          grid: { color: gridColor }
        }
      }
    }
  });
}

function analyticsDateKey(tx){
  if(tx && tx.ts){
    const d=new Date(Number(tx.ts));
    if(!Number.isNaN(d.getTime())) return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  const raw=String(tx?.date||'').trim();
  let m=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m)return m[1]+'-'+m[2]+'-'+m[3];
  m=raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if(m)return m[3]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0');
  return '';
}

function renderProInsights(){
  const node=document.getElementById('proInsightsCard');
  if(!node)return;
  if(!canUseProFeatures){
    node.innerHTML='<div class="pro-insights-lock"><div class="pro-insights-lock-icon">✦</div><div><b>'+t('Расширенная аналитика PRO')+'</b><p>'+t('Сравнение с прошлым месяцем, топ категорий, средние дневные траты и прогноз до конца месяца.')+'</p><button class="btn btn-accent btn-sm" onclick="switchTab(\'pay\')">'+t('Открыть PRO')+'</button></div></div>';
    return;
  }
  const budget=getVisibleBudget();
  const now=new Date();
  const currentKey=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  const prevDate=new Date(now.getFullYear(),now.getMonth()-1,1);
  const previousKey=prevDate.getFullYear()+'-'+String(prevDate.getMonth()+1).padStart(2,'0');
  const daysInMonth=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
  const day=Math.max(1,now.getDate());
  let currentExpense=0,previousExpense=0,currentIncome=0;
  const categories={};
  (budget.history||[]).forEach(tx=>{
    const key=analyticsDateKey(tx).slice(0,7);
    const amount=Number(tx.amount||0);
    if(!Number.isFinite(amount)||amount<=0)return;
    if(key===currentKey&&tx.type==='expense'){
      currentExpense+=amount;
      const category=String(tx.category||'Разное');
      categories[category]=(categories[category]||0)+amount;
    }else if(key===previousKey&&tx.type==='expense')previousExpense+=amount;
    if(key===currentKey&&tx.type==='income')currentIncome+=amount;
  });
  const projected=currentExpense/day*daysInMonth;
  const difference=previousExpense>0?((currentExpense-previousExpense)/previousExpense)*100:null;
  const top=Object.entries(categories).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const categoryHtml=top.length?top.map(([name,amount],i)=>{
    const pct=currentExpense>0?Math.round(amount/currentExpense*100):0;
    return '<div class="pro-insight-category"><div class="pro-insight-category-top"><span><i>'+String(i+1)+'</i>'+bankEscape(tCat(name))+'</span><b>'+fmtMoney(amount)+'</b></div><div class="progress-track"><div class="progress-fill" style="width:'+pct+'%"></div></div><small>'+pct+'% '+t('расходов за месяц')+'</small></div>';
  }).join(''):'<p class="muted">'+t('Пока нет расходов за текущий месяц — добавь операции, и здесь появится анализ.')+'</p>';
  const compareText=difference===null?t('Нет данных за прошлый месяц'):(difference>0?t('Расходы выросли на '):t('Расходы снизились на '))+Math.abs(Math.round(difference))+t('% к прошлому месяцу');
  const compareClass=difference===null?'neutral':difference>0?'negative':'positive';
  const envelopeItems=budgetMode==='family'&&currentFamily?familyEnvelopes:(appData.envelopes||[]);
  const historyForAlerts=budget.history||[];
  const envelopeWarnings=envelopeItems.map(env=>{
    const spent=historyForAlerts.filter(tx=>tx.type==='expense'&&String(tx.envelopeId||'')===String(env.id)).reduce((sum,tx)=>sum+Math.max(0,Number(tx.amount)||0),0);
    const target=Number(env.target||0);
    return {name:String(env.name||'Конверт'),spent,target,over:spent-target};
  }).filter(env=>env.target>0&&env.over>0);
  const alerts=[];
  if(currentExpense>currentIncome&&currentExpense>0)alerts.push({level:'warning',text:t('Расходы за месяц превышают доходы на {amount}.').replace('{amount}',fmtMoney(currentExpense-currentIncome))});
  envelopeWarnings.slice(0,3).forEach(env=>alerts.push({level:'warning',text:t('Конверт «{name}»: превышение лимита на {amount}.').replace('{name}',env.name).replace('{amount}',fmtMoney(env.over))}));
  if(currentExpense===0&&envelopeWarnings.length===0)alerts.push({level:'ok',text:t('Пока нет признаков перерасхода. Добавляй операции, чтобы отслеживать бюджет.')});
  const alertsHtml='<div class="pro-insights-alerts"><div class="pro-insights-section-title">'+t('Контроль бюджета')+'</div>'+alerts.map(a=>'<div class="pro-insight-alert '+a.level+'"><span>'+(a.level==='warning'?'⚠️':'✓')+'</span><p>'+bankEscape(a.text)+'</p></div>').join('')+'</div>';
  node.innerHTML='<div class="pro-insights-head"><div><span class="pro-insights-eyebrow">'+t('Аналитика PRO')+'</span><h4>'+t('Финансовая картина')+'</h4><p>'+t('На основе операций текущего и прошлого месяца')+'</p></div><span class="pro-insights-crown">♛</span></div>'+
    '<div class="pro-insights-metrics">'+
      '<div class="pro-insight-metric"><span>'+t('Прогноз расходов')+'</span><b>'+fmtMoney(projected)+'</b><small>'+t('к концу месяца')+'</small></div>'+
      '<div class="pro-insight-metric"><span>'+t('В среднем в день')+'</span><b>'+fmtMoney(currentExpense/day)+'</b><small>'+t('за {day} дн. текущего месяца').replace('{day}',day)+'</small></div>'+
      '<div class="pro-insight-metric"><span>'+t('Доходы за месяц')+'</span><b>'+fmtMoney(currentIncome)+'</b><small>'+t('по записанным операциям')+'</small></div>'+
      '<div class="pro-insight-metric"><span>'+t('Траты за месяц')+'</span><b>'+fmtMoney(currentExpense)+'</b><small>'+t('из {days} дней').replace('{days}',daysInMonth)+'</small></div>'+
    '</div>'+
    '<div class="pro-insight-comparison '+compareClass+'"><span>'+t('Сравнение с прошлым месяцем')+'</span><b>'+bankEscape(compareText)+'</b>'+(previousExpense>0?'<small>'+t('Прошлый месяц: {amount}').replace('{amount}',fmtMoney(previousExpense))+'</small>':'')+'</div>'+
    alertsHtml+
    '<div class="pro-insights-categories"><div class="pro-insights-section-title">'+t('Куда уходят деньги')+'</div>'+categoryHtml+'</div>'+
    '<p class="pro-insights-note">'+t('Прогноз — ориентир по средним расходам с начала месяца, а не гарантия будущих трат.')+'</p>';
}

function renderForecast(){
  const card = document.getElementById('forecastCard');
  if(!card) return;

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();

  if(appData.monthExpense > 0 && now.getDate() > 0){
    const projected = appData.monthExpense / now.getDate() * daysInMonth;
    card.style.display = 'block';
    document.getElementById('forecastBody').innerHTML =
      t('forecast_text').replace('{sum}', fmtMoney(projected));
  } else {
    card.style.display = 'none';
  }
}

function renderAll(){
  const visibleBudget=getVisibleBudget(),balance=document.getElementById('totalBalance'),income=document.getElementById('monthIncome'),expense=document.getElementById('monthExpense');
  if(balance)balance.innerText=fmtMoney(visibleBudget.balance);if(income)income.innerText='+'+fmtMoney(visibleBudget.monthIncome);if(expense)expense.innerText='-'+fmtMoney(visibleBudget.monthExpense);
  const title=document.getElementById('budgetBalanceTitle');if(title)title.textContent=visibleBudget.isFamily?t('family_balance_title') : t('personal_balance_title');
  const search=document.getElementById('histSearch'),q=search?search.value.toLowerCase():'';
  const memberFilter=document.getElementById('histMemberFilter');
  if(memberFilter){
    const currentMember=memberFilter.value;
    const members=[...new Set(visibleBudget.history.map(tx=>String(tx.memberName||'').trim()).filter(Boolean))].sort((x,y)=>x.localeCompare(y,'ru'));
    memberFilter.style.display=visibleBudget.isFamily?'block':'none';
    const options='<option value="">Все участники</option>'+members.map(name=>'<option value="'+name.replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'">'+name.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</option>').join('');
    if(memberFilter.dataset.options!==options){
      memberFilter.innerHTML=options;
      memberFilter.dataset.options=options;
      memberFilter.value=members.includes(currentMember)?currentMember:'';
    }
  }
  const selectedMember=memberFilter&&visibleBudget.isFamily?memberFilter.value:'';
  const filtered=visibleBudget.history.filter(tx => {
    const matchesSearch=!q ||
      String(tx.title || '').toLowerCase().includes(q) ||
      tCat(tx.category || '').toLowerCase().includes(q) ||
      String(tx.memberName || '').toLowerCase().includes(q);
    const matchesMember=!selectedMember||String(tx.memberName||'')===selectedMember;
    return matchesSearch&&matchesMember;
  });

  const hist = document.getElementById('historyContainer');

  if(hist){
    hist.innerHTML = filtered.length
      ? filtered.map(tx => `
        <div class="history-item">
          <div class="history-left">
            <div class="history-icon">${tx.icon || '📦'}</div>
            <div>
              <div class="history-title">${tx.title || tCat(tx.category || 'Разное')} ${tx.receipt ? '🧾' : ''}</div>
              <div class="history-sub">${visibleBudget.isFamily ? ((tx.date ? new Date(tx.date).toLocaleDateString('ru-RU') : '') + (tx.memberName ? ' · ' + tx.memberName : '')) : (tx.date || '')}</div>
            </div>
          </div>
          <div class="history-amount ${tx.type === 'expense' ? 'exp' : 'inc'}">
            ${tx.type === 'expense' ? '-' : '+'}${fmtMoney(tx.amount)}
          </div>
          ${tx.receipt ? '<div class="history-receipt-actions"><button class="card-action" aria-label="Изменить чек" onclick="editReceipt('+JSON.stringify(String(tx.id))+')"><i class="fa-solid fa-pen"></i></button><button class="card-action danger" aria-label="Удалить чек" onclick="deleteReceipt('+JSON.stringify(String(tx.id))+')"><i class="fa-solid fa-trash"></i></button></div>' : ''}
          <button class="card-action" aria-label="Изменить операцию" title="Изменить операцию" onclick="openTxEditor(${JSON.stringify(String(tx.id))})"><i class="fa-solid fa-pen"></i></button>
          <button class="card-del" style="position:static" aria-label="Удалить операцию" onclick="deleteTx(${JSON.stringify(String(tx.id))})">✕</button>
        </div>
      `).join('')
      : `<div class="muted" style="text-align:center">${t('no_rules')}</div>`;
  }

  const envelopes = document.getElementById('envelopesList');
  if(envelopes){
    const envelopeItems = budgetMode==='family'&&currentFamily ? familyEnvelopes : (appData.envelopes || []);
    const visibleHistory = budgetMode==='family'&&currentFamily ? familyTransactions : (appData.history || []);
    envelopes.innerHTML = envelopeItems.map(e => {
      const spent=visibleHistory.filter(tx=>tx.type==='expense'&&String(tx.envelopeId||'')===String(e.id)).reduce((sum,tx)=>sum+Number(tx.amount||0),0);
      const remaining=Number(e.target||0)-spent;
      const pct=Number(e.target)>0?Math.min(100,Math.max(0,spent/Number(e.target)*100)):0;
      return `<div class="card envelope-card">
        <div class="envelope-card-top"><b>📩 ${e.name}</b><span class="envelope-spent">${fmtMoney(spent)} / ${fmtMoney(e.target)}</span></div>
        <div class="manage-card-actions"><button class="btn btn-outline btn-sm" onclick="openEnvelopeEditor('${e.id}')"><i class="fa-solid fa-pen"></i> Изменить</button><button class="btn btn-outline btn-sm danger" onclick="deleteEnvelope('${e.id}')"><i class="fa-solid fa-trash"></i> Удалить</button></div>
        <div class="progress-track"><div class="progress-fill ${pct>=100?'over-limit':''}" style="width:${pct}%"></div></div>
        <div class="envelope-card-bottom"><span>${remaining>=0?'Осталось':'Превышение'}: ${fmtMoney(Math.abs(remaining))}</span><span>${Math.round(pct)}%</span></div>
      </div>`;
    }).join('') || '<div class="muted">'+t('no_envelopes')+'</div>';
  }

  const banks = document.getElementById('banksList');
  if(banks){
    const bankItems=budgetMode==='family'&&currentFamily?familyBanks:appData.banks;
    banks.innerHTML = bankItems.map(b => {
      const saved=Number(b.balance||0),target=Number(b.target||0),pct=target>0?Math.min(100,saved/target*100):0;
      const goalStatusHtml=target>0?(saved>=target?'<div class="bank-goal-achieved">'+t('goal_reached_caption')+'</div>':'<div class="bank-goal-remaining">'+t('goal_remaining_caption').replace('{amount}','<b>'+fmtMoney(Math.max(0,target-saved))+'</b>')+'</div>'):'';
      const contributionHistory=budgetMode==='family'&&currentFamily&&Array.isArray(b.contributions)?b.contributions:[];
      const contributorTotals=budgetMode==='family'&&currentFamily&&Array.isArray(b.contributors)?b.contributors:[];
      const contributorTotalsHtml=contributorTotals.length
        ? '<div class="bank-contribution-history"><b>Всего внесли</b>'+contributorTotals.slice(0,8).map(c=>'<div class="bank-contribution-row"><span>'+bankEscape(c.memberName||'Участник')+'<small>'+Number(c.count||0)+' пополнений</small></span><strong>'+fmtMoney(Number(c.amount)||0)+'</strong></div>').join('')+'</div>'
        : '';
      const contributionHistoryHtml=contributionHistory.length
        ? '<div class="bank-contribution-history"><b>История пополнений</b>'+contributionHistory.slice(0,8).map(c=>'<div class="bank-contribution-row"><span>'+bankEscape(c.memberName||'Участник')+'<small>'+bankEscape(c.date?new Date(c.date+'T12:00:00').toLocaleDateString('ru-RU'):'Дата не указана')+'</small></span><strong>+'+fmtMoney(Number(c.amount)||0)+'</strong></div>').join('')+'</div>'
        : (budgetMode==='family'&&currentFamily?'<div class="bank-contribution-history muted">Пополнений пока нет.</div>':'');
      let deadlineText = '';
      if(b.deadline){
        const today = new Date(); today.setHours(0,0,0,0);
        const due = new Date(b.deadline + 'T00:00:00');
        const daysLeft = Math.round((due.getTime()-today.getTime())/86400000);
        deadlineText = saved >= target
          ? '✅ Цель достигнута'
          : daysLeft < 0
            ? t('deadline_reached').replace('{days}',String(Math.abs(daysLeft)))
            : daysLeft === 0
              ? t('deadline_today')
              : t('deadline_days_left').replace('{days}',String(daysLeft));
      }
      return `<div class="card bank-card">
        <div class="bank-card-top"><b>🏦 ${b.name}</b><span class="bank-saved">${fmtMoney(saved)}</span></div>
        <div class="progress-track"><div class="progress-fill bank-progress" style="width:${pct}%"></div></div>
        <div class="envelope-card-bottom"><span>Цель: ${fmtMoney(target)}</span><span>${Math.round(pct)}%</span></div>
        ${goalStatusHtml}
        <div class="muted" style="font-size:12px;margin:6px 0 10px">${target>0&&saved>=target?t('goal_reached_caption'):target>0?t('goal_remaining_caption').replace('{amount}',fmtMoney(Math.max(0,target-saved))):''}</div>
        ${b.deadline ? '<div class="muted" style="font-size:12px;margin:6px 0 10px">' + t('Дедлайн:') + ' ' + new Date(b.deadline + 'T00:00:00').toLocaleDateString(appData.lang || 'ru-RU') + ' · ' + deadlineText + '</div>' : ''}
        ${contributorTotalsHtml}
        ${contributionHistoryHtml}
        <div class="manage-card-actions"><button class="btn btn-outline btn-sm" onclick="openBankEditor('${b.id}')"><i class="fa-solid fa-pen"></i> Изменить</button><button class="btn btn-outline btn-sm danger" onclick="deleteBank('${b.id}')"><i class="fa-solid fa-trash"></i> Удалить</button></div>
        <button class="btn btn-outline btn-sm bank-add-btn" onclick="contributeToBank('${b.id}')">＋ Пополнить</button>
      </div>`;
    }).join('') || '<div class="muted">'+t('no_savings_banks')+'</div>';
  }

  const recurring = document.getElementById('recurringList');
  if(recurring){
    ensureRecurringIds();
    recurring.innerHTML = appData.recurring.length
      ? appData.recurring.map(r =>
          `<div class="recurring-item"><span><b>${bankEscape(r.name)}</b><small>${fmtMoney(r.amount)} · ${t('due_day').replace('{day}',r.day)}</small><small class="recurring-reminder-note">${t('payment_reminder_label')}</small></span><button type="button" class="financial-item-delete" aria-label="${t('delete_entry')}" onclick="deleteRecurring('${String(r.id)}')">×</button></div>`
        ).join('')
      : t('no_rules');
  }

  applyLang();
  renderFinancialOverview();
  renderForecast();
  renderProInsights();
  updateProFeatureControls();
}


let appInitialized = false;

function ensureFinancialItems(){
  if(!Array.isArray(appData.financialItems)) appData.financialItems=[];
  return appData.financialItems;
}

function renderFinancialOverview(){
  const items=ensureFinancialItems();
  const familyMode=budgetMode==='family'&&!!currentFamily;
  const visibleBudget=getVisibleBudget();
  const bankItems=familyMode?(Array.isArray(familyBanks)?familyBanks:[]):(Array.isArray(appData.banks)?appData.banks:[]);
  const cash=Number(visibleBudget.balance||0);
  const savings=bankItems.reduce((sum,bank)=>sum+Math.max(0,Number(bank.balance)||0),0);
  // Additional assets and debts are private profile data; never mix them into a family total.
  const personalItems=familyMode?[]:items;
  const assets=personalItems.filter(item=>item.type==='asset').reduce((sum,item)=>sum+Math.max(0,Number(item.amount)||0),0);
  const debts=personalItems.filter(item=>item.type==='debt').reduce((sum,item)=>sum+Math.max(0,Number(item.amount)||0),0);
  const addButton=document.getElementById('financialAddItemButton');
  if(addButton)addButton.style.display=familyMode?'none':'';
  const note=document.getElementById('financialOverviewNote');
  if(note)note.textContent=t(familyMode?'fin_family_note':'fin_note');
  const values={
    financialNetWorth:cash+savings+assets-debts,
    financialCashBalance:cash,
    financialSavings:savings,
    financialAssets:assets,
    financialDebts:debts
  };
  Object.entries(values).forEach(([id,value])=>{
    const node=document.getElementById(id);
    if(node)node.textContent=fmtMoney(value);
  });
  const list=document.getElementById('financialItemsList');
  if(!list)return;
  if(familyMode){
    list.innerHTML='<div class="muted financial-empty">'+t('fin_family_note')+'</div>';
    return;
  }
  if(!items.length){
    list.innerHTML='<div class="muted financial-empty">'+t('fin_empty')+'</div>';
    return;
  }
  list.innerHTML=items.map(item=>{
    const isDebt=item.type==='debt';
    return '<div class="financial-item-row '+(isDebt?'is-debt':'is-asset')+'">'+
      '<span class="financial-item-icon">'+(isDebt?'↘':'↗')+'</span>'+
      '<span class="financial-item-name"><b>'+bankEscape(item.name|| (isDebt?t('debt'):t('asset')))+'</b><small>'+(isDebt?t('debt'):t('asset'))+'</small></span>'+
      '<strong>'+(isDebt?'−':'＋')+fmtMoney(Number(item.amount)||0)+'</strong>'+
      '<button class="financial-item-edit" type="button" aria-label="'+t('edit_entry')+' '+bankEscape(item.name||'')+'" onclick="openEditFinancialItem(\''+String(item.id)+'\')">✎</button>'+
      '<button class="financial-item-delete" type="button" aria-label="'+t('delete_entry')+' '+bankEscape(item.name||'')+'" onclick="deleteFinancialItem(\''+String(item.id)+'\')">×</button>'+
      '</div>';
  }).join('');
}

function openEditFinancialItem(id){
  const item=ensureFinancialItems().find(entry=>String(entry.id)===String(id));
  if(!item)return;
  document.getElementById('financialItemEditId').value=String(item.id);
  document.getElementById('financialItemType').value=item.type==='debt'?'debt':'asset';
  document.getElementById('financialItemName').value=item.name||'';
  document.getElementById('financialItemAmount').value=Number(item.amount)||'';
  document.getElementById('financialItemModalTitle').textContent=t('edit_entry')+' '+t('asset')+' / '+t('debt');
  document.getElementById('financialItemSaveButton').textContent=t('save_changes');
  openModal('modalFinancialItem');
}

function saveFinancialItem(){
  const type=document.getElementById('financialItemType').value==='debt'?'debt':'asset';
  const name=document.getElementById('financialItemName').value.trim();
  const amount=Number(document.getElementById('financialItemAmount').value);
  const editId=document.getElementById('financialItemEditId').value;
  if(!name){alert(t('enter_name'));return;}
  if(!Number.isFinite(amount)||amount<=0){alert(t('invalid_payment_amount'));return;}
  const items=ensureFinancialItems();
  if(editId){
    const item=items.find(entry=>String(entry.id)===String(editId));
    if(!item)return;
    Object.assign(item,{type,name,amount});
  }else{
    items.push({id:String(Date.now())+'_'+Math.random().toString(36).slice(2,7),type,name,amount});
  }
  saveData();
  document.getElementById('financialItemEditId').value='';
  document.getElementById('financialItemName').value='';
  document.getElementById('financialItemAmount').value='';
  document.getElementById('financialItemType').value='asset';
  document.getElementById('financialItemModalTitle').textContent=t('add_financial_item');
  document.getElementById('financialItemSaveButton').textContent='Сохранить';
  closeModal('modalFinancialItem');
  renderFinancialOverview();
}

function deleteFinancialItem(id){
  const items=ensureFinancialItems();
  const item=items.find(entry=>String(entry.id)===String(id));
  if(!item)return;
  if(!confirm(t('delete_financial_confirm').replace('{name}',String(item.name||'').replace(/[<>]/g,''))))return;
  appData.financialItems=items.filter(entry=>String(entry.id)!==String(id));
  saveData();
  renderFinancialOverview();
}

function initApp(){
  // Avoid a blank/stale first screen: initialize once, then refresh rendered values.
  if (appInitialized) {
    renderAll();
    return;
  }
  appInitialized = true;
  budgetMode = 'personal';
  localStorage.setItem('budgetMode_' + telegramUserId, 'personal');

  setTheme(appData.theme || 'dark');
  applyLang();
  applyWallpaper();
  renderAll();

  if(window.Telegram && window.Telegram.WebApp){
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
  }

  const params = new URLSearchParams(window.location.search);
  if(params.get('screen') === 'pay'){
    document.querySelectorAll('.tab-content').forEach(el => {
      el.style.display = 'none';
    });
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.remove('active');
    });
    document.getElementById('tab-pay').style.display = 'block';
  }

  loadPlanStatus();
  refreshRewardStatus();
  refreshAIStatus();
  loadFamilyStatus();
  syncPaymentReminders();

  // Keep shared family data fresh when another member makes changes.
  window.addEventListener('focus', refreshFamilyData);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshFamilyData();
  });
  window.setInterval(() => {
    if (!document.hidden) refreshFamilyData();
  }, 20000);
}

async function buyPlan(plan, method){
  try{
    const tg = window.Telegram && window.Telegram.WebApp;
    const initData = tg && tg.initData;

    if(!initData){
      alert('Открой приложение через Telegram');
      return;
    }

    const endpoint = method === 'stars'
      ? '/api/pay/stars'
      : method === 'walletpay'
        ? '/api/pay/walletpay'
        : '/api/pay/crypto';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Init-Data': initData
      },
      body: JSON.stringify({
        plan,
        couponType: document.getElementById('couponTypeSelect')?.value || ''
      })
    });

    const data = await response.json();

    if(!response.ok || !data.invoice_url){
      throw new Error(data.detail || 'Не удалось создать счёт');
    }

    if(method === 'stars' && tg.openInvoice){
      tg.openInvoice(data.invoice_url, status => {
        if(status === 'paid'){
          alert('Платёж получен. Проверяем активацию подписки.');
        } else if(status === 'failed'){
          alert('Оплата не прошла. Попробуй ещё раз.');
        }
      });
    } else if(tg.openLink){
      tg.openLink(data.invoice_url);
    } else {
      window.open(data.invoice_url, '_blank');
    }
  } catch(error){
    alert(t('payment_error').replace('{error}',String(error.message||'')));
  }
}

function showExportToast(message) {
    const oldToast = document.querySelector('.export-toast');
    if (oldToast) oldToast.remove();

    const toast = document.createElement('div');
    toast.className = 'export-toast';

    const icon = document.createElement('span');
    icon.className = 'export-toast-icon';
    icon.textContent = '✓';

    const text = document.createElement('span');
    text.textContent = message;

    toast.append(icon, text);
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

let financeAssistantMessages = [];
let financeAssistantBusy = false;

function renderFinanceAssistantMessages(){
  const box = document.getElementById('financeAssistantMessages');
  if(!box) return;
  box.innerHTML = '';
  if(!financeAssistantMessages.length){
    const welcome = document.createElement('div');
    welcome.className = 'finance-assistant-welcome';
    welcome.textContent = 'Привет! Я помогу разобраться с расходами, найти возможности для экономии и оценить бюджет. Задай вопрос ниже.';
    box.appendChild(welcome);
  }
  financeAssistantMessages.slice(-12).forEach(message => {
    const item = document.createElement('div');
    item.className = 'finance-assistant-message ' + (message.role === 'user' ? 'is-user' : 'is-assistant');
    item.textContent = message.content;
    box.appendChild(item);
  });
  if(financeAssistantBusy){
    const loading = document.createElement('div');
    loading.className = 'finance-assistant-message is-assistant is-loading';
    loading.textContent = 'ИИ анализирует бюджет…';
    box.appendChild(loading);
  }
  box.scrollTop = box.scrollHeight;
}

function financeAssistantContext(){
  const period = String(appData.currentMonth || new Date().getFullYear() + '-' + String(new Date().getMonth()+1).padStart(2,'0'));
  let source = [];
  const familyMode = typeof budgetMode !== 'undefined' && budgetMode === 'family' && typeof currentFamily !== 'undefined' && currentFamily;
  if(familyMode && typeof familyTransactions !== 'undefined' && Array.isArray(familyTransactions)){
    source = familyTransactions;
  } else {
    source = Array.isArray(appData.history) ? appData.history : [];
  }
  const transactions = source.map(tx => {
    const date = String(tx.date || (tx.ts ? new Date(Number(tx.ts)).toISOString().slice(0,10) : '')).slice(0,10);
    return {
      type: tx.type === 'income' ? 'income' : 'expense',
      amount: Number(tx.amount || 0),
      currency: String(tx.currency || appData.currency || 'UAH'),
      date,
      category: String(tx.category || 'Разное').slice(0,64),
      title: String(tx.title || tx.note || tx.category || 'Операция').slice(0,100)
    };
  }).filter(tx => Number.isFinite(tx.amount) && tx.amount > 0)
    .sort((a,b) => b.date.localeCompare(a.date));
  const monthTransactions = transactions.filter(tx => tx.date.startsWith(period));
  const totalIncome = list => list.filter(tx=>tx.type==='income').reduce((sum,tx)=>sum+tx.amount,0);
  const totalExpense = list => list.filter(tx=>tx.type==='expense').reduce((sum,tx)=>sum+tx.amount,0);
  return {
    summary: {
      balance: familyMode ? totalIncome(transactions)-totalExpense(transactions) : Number(appData.balance || 0),
      monthIncome: familyMode ? totalIncome(monthTransactions) : Number(appData.monthIncome || 0),
      monthExpense: familyMode ? totalExpense(monthTransactions) : Number(appData.monthExpense || 0),
      currency: String(appData.currency || 'UAH'),
      period
    },
    transactions: transactions.slice(0,60)
  };
}

async function refreshRewardStatus(){
  const tg=window.Telegram?.WebApp;
  const status=document.getElementById('rewardStatusText');
  const claim=document.getElementById('dailyRewardClaimBtn');
  if(!status)return;
  if(!tg?.initData){status.textContent='Открой приложение через Telegram, чтобы получать награды.';if(claim)claim.disabled=true;return;}
  try{
    const response=await fetch('/api/rewards/status',{headers:{'X-Init-Data':tg.initData}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.detail||'Не удалось загрузить награды.');
    const points=document.getElementById('rewardPointsValue');
    const streak=document.getElementById('rewardStreakValue');
    if(points)points.textContent=String(Number(data.points||0));
    if(streak)streak.textContent=String(Number(data.streak||0));
    if(claim)claim.disabled=Boolean(data.claimed_today);
    status.textContent=t(data.claimed_today ? 'src_daily_claimed' : 'src_daily_available');
  }catch(error){status.textContent=error.message||'Не удалось загрузить награды.';}
}

async function claimDailyReward(){
  const tg=window.Telegram?.WebApp;
  const status=document.getElementById('rewardStatusText');
  const button=document.getElementById('dailyRewardClaimBtn');
  if(!tg?.initData){if(status)status.textContent='Открой приложение через Telegram.';return;}
  if(button)button.disabled=true;
  try{
    const response=await fetch('/api/rewards/claim',{method:'POST',headers:{'X-Init-Data':tg.initData}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.detail||'Не удалось забрать награду.');
    if(status)status.textContent=data.claimed_today?'Награда за сегодня уже получена.':'Начислено '+Number(data.earned||0)+' монет'+(Number(data.bonus||0)>0?' (включая бонус серии +'+Number(data.bonus)+')':'')+'!';
    await refreshRewardStatus();
    await loadPlanStatus();
  }catch(error){if(status)status.textContent=error.message||'Ошибка получения награды.';if(button)button.disabled=false;}
}

async function refreshCryptoCouponBalance(){
  const status=document.getElementById('cryptoCouponShopStatus');
  if(status)status.textContent='Обновляю баланс купонов…';
  try{
    await loadPlanStatus();
    const c10=Number(referralStats.coupons10||0);
    const c20=Number(referralStats.coupons20||0);
    if(status)status.textContent=t('Доступно купонов: 10% — {c10}, 20% — {c20}.').replace('{c10}',String(c10)).replace('{c20}',String(c20));
  }catch(error){
    if(status)status.textContent='Не удалось обновить баланс. Попробуй ещё раз.';
  }
}

async function buyCryptoCoupon(percent){
  const tg=window.Telegram?.WebApp;
  const status=document.getElementById('cryptoCouponShopStatus');
  if(!tg?.initData){
    if(status)status.textContent='Открой приложение через Telegram, чтобы купить купон.';
    return;
  }
  if(![10,20].includes(Number(percent))){
    if(status)status.textContent='Выбери купон 10% или 20%.';
    return;
  }
  const price=Number(percent)===10?1:2;
  if(status)status.textContent=t('crypto_invoice_creating').replace('{price}',String(price));
  try{
    const response=await fetch('/api/coupons/shop/crypto',{
      method:'POST',
      headers:{'Content-Type':'application/json','X-Init-Data':tg.initData},
      body:JSON.stringify({percent:String(percent)})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.invoice_url)throw new Error(data.detail||t('crypto_invoice_failed'));
    if(status)status.textContent=t('crypto_invoice_created').replace('{price}',String(price));
    const invoiceUrl=String(data.invoice_url);
    // Use the same Telegram WebApp link opener as successful tariff payments.
    if(typeof tg.openLink==='function'){
      tg.openLink(invoiceUrl);
    }else if(typeof tg.openTelegramLink==='function'&&/^https:\/\/t\.me\//i.test(invoiceUrl)){
      tg.openTelegramLink(invoiceUrl);
    }else{
      const opened=window.open(invoiceUrl,'_blank');
      if(!opened)window.location.href=invoiceUrl;
    }
  }catch(error){
    if(status)status.textContent=error.message||'Не удалось создать счёт. Попробуй ещё раз.';
  }
}

async function buyRewardCoupon(percent){
  const tg=window.Telegram?.WebApp;
  const status=document.getElementById('rewardStatusText');
  if(!tg?.initData){if(status)status.textContent='Открой приложение через Telegram.';return;}
  try{
    const response=await fetch('/api/rewards/shop/buy',{method:'POST',headers:{'Content-Type':'application/json','X-Init-Data':tg.initData},body:JSON.stringify({percent:String(percent)})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.detail||'Не удалось купить купон.');
    if(status)status.textContent=t('crypto_coupon_bought').replace('{percent}',String(percent)).replace('{points}',String(Number(data.points||0)));
    await refreshRewardStatus();
    await loadPlanStatus();
  }catch(error){if(status)status.textContent=error.message||'Не удалось купить купон.';}
}

async function refreshAIStatus(){
  const node=document.getElementById('aiUsageStatus');
  if(!node)return;
  const tg=window.Telegram?.WebApp;
  if(!tg?.initData){node.textContent=t('ai_status_telegram');return;}
  try{
    const response=await fetch('/api/ai/status',{headers:{'X-Init-Data':tg.initData}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.detail||t('ai_status_failed'));
    const parts=[];
    if(data.is_pro)parts.push(t('PRO: осталось {remaining} из {limit} запросов в этом месяце').replace('{remaining}',String(Number(data.monthly_remaining||0))).replace('{limit}',String(Number(data.monthly_limit||30))));
    if(Number(data.credits||0)>0)parts.push(t('Купленные запросы: {credits}').replace('{credits}',String(Number(data.credits))));
    node.textContent=parts.join(' · ')||t('ai_no_requests');
  }catch(error){node.textContent=t('ai_balance_load_failed');}
}

async function buyAIPack(packId){
  const tg=window.Telegram?.WebApp;
  const status=document.getElementById('aiPackStatus');
  if(!tg?.initData){if(status)status.textContent=t('ai_pack_telegram');return;}
  const buttons=[...document.querySelectorAll('.ai-credit-packs button')];
  buttons.forEach(button=>button.disabled=true);
  if(status)status.textContent=t('ai_pack_creating');
  try{
    const response=await fetch('/api/ai/pack/crypto',{
      method:'POST',
      headers:{'Content-Type':'application/json','X-Init-Data':tg.initData},
      body:JSON.stringify({pack:packId})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.detail||t('ai_pack_failed'));
    if(status)status.textContent=t('ai_pack_created');
    if(data.invoice_url){
      if(typeof tg.openLink==='function')tg.openLink(data.invoice_url);
      else window.open(data.invoice_url,'_blank','noopener');
    }
  }catch(error){if(status)status.textContent=error.message||t('ai_pack_failed');}
  finally{buttons.forEach(button=>button.disabled=false);}
}

async function sendFinanceQuestion(){
  if(financeAssistantBusy) return;
  const input = document.getElementById('financeAssistantInput');
  const question = String(input?.value || '').trim();
  if(!question) return;
  const tg = window.Telegram?.WebApp;
  if(!tg?.initData){
    alert('Открой Family Budget через Telegram, чтобы пользоваться ИИ-помощником.');
    return;
  }
  financeAssistantMessages.push({role:'user',content:question.slice(0,1200)});
  if(input) input.value = '';
  financeAssistantBusy = true;
  const send = document.getElementById('financeAssistantSend');
  if(send) send.disabled = true;
  renderFinanceAssistantMessages();
  try{
    const response = await fetch('/api/assistant/chat',{
      method:'POST',
      headers:{'Content-Type':'application/json','X-Init-Data':tg.initData},
      body:JSON.stringify({
        question:question.slice(0,1200),
        language:appData.lang || 'ru',
        messages:financeAssistantMessages.slice(0,-1).slice(-8),
        context:financeAssistantContext()
      })
    });
    const data = await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.detail || t('ai_response_failed'));
    financeAssistantMessages.push({role:'assistant',content:String(data.answer || t('ai_response_empty'))});
    refreshAIStatus();
  }catch(error){
    financeAssistantMessages.push({role:'assistant',content:t('ai_response_error').replace('{error}',String(error.message || t('ai_response_retry')))});
  }finally{
    financeAssistantBusy = false;
    if(send) send.disabled = false;
    renderFinanceAssistantMessages();
  }
}

function askFinanceSuggestion(question){
  const input = document.getElementById('financeAssistantInput');
  if(input) input.value = question;
  sendFinanceQuestion();
}

// Initialize safely whether this file runs before or after DOMContentLoaded.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp, { once: true });
} else {
  initApp();
}

// Refresh after the page is fully loaded or restored from the browser cache.
window.addEventListener('load', renderAll, { once: true });
window.addEventListener('pageshow', renderAll);
