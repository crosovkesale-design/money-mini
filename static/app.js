const LANGS = [{id:'ru',flag:'🇷🇺',label:'Русский'},{id:'uk',flag:'🇺🇦',label:'Українська'},{id:'en',flag:'🇬🇧',label:'English'},{id:'de',flag:'🇩🇪',label:'Deutsch'},{id:'es',flag:'🇪🇸',label:'Español'},{id:'fr',flag:'🇫🇷',label:'Français'},{id:'it',flag:'🇮🇹',label:'Italiano'},{id:'pl',flag:'🇵🇱',label:'Polski'},{id:'tr',flag:'🇹🇷',label:'Türkçe'},{id:'zh',flag:'🇨🇳',label:'中文'}];
const CURRENCIES = [{id:'UAH',sym:'₴',label:'Hryvnia'},{id:'RUB',sym:'₽',label:'Ruble'},{id:'USD',sym:'$',label:'Dollar'},{id:'EUR',sym:'€',label:'Euro'},{id:'PLN',sym:'zł',label:'Zloty'},{id:'GBP',sym:'£',label:'Pound'},{id:'TRY',sym:'₺',label:'Lira'},{id:'CHF',sym:'₣',label:'Franc'},{id:'CZK',sym:'Kč',label:'Krona'},{id:'JPY',sym:'¥',label:'Yen'},{id:'CNY',sym:'元',label:'Yuan'}];

// Keep each Telegram account's financial data in its own browser storage namespace.
const telegramUserId = String(window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 'guest');
const appStorageKey = 'budgetApp_v18_user_' + telegramUserId;
let appData = JSON.parse(localStorage.getItem(appStorageKey)) || {
  balance: 0, monthIncome: 0, monthExpense: 0, history: [], envelopes: [], banks: [], recurring: [], customCategories: [],
  selectedCategory: 'Еда', currentIcon: '🍔', lang: 'ru', currency: 'UAH', theme: 'dark', wallpaper: null,
  currentMonth: new Date().getFullYear() + '-' + String(new Date().getMonth()+1).padStart(2,'0')
};

let canUseProFeatures = false;
let referralStats = { count: 0, coupons10: 0, coupons20: 0 };

let bankImportRows = [];
let bankImportBusy = false;

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
  if(!tg?.initData){status.textContent='Открой приложение через Telegram, чтобы загрузить выписку.';return;}
  if(!/\.(csv|xlsx)$/i.test(file.name)){status.textContent='Выбери файл CSV или XLSX.';return;}
  if(file.size>8*1024*1024){status.textContent='Файл больше 8 МБ. Раздели выписку на несколько файлов.';return;}
  bankImportBusy=true;confirm.disabled=true;rowsNode.innerHTML='';status.textContent='Читаю выписку…';
  try{
    const form=new FormData();form.append('file',file,file.name);
    const response=await fetch('/api/import/preview',{method:'POST',headers:{'X-Init-Data':tg.initData},body:form});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.detail||'Не удалось прочитать выписку.');
    bankImportRows=(data.rows||[]).map((row,index)=>{
      const type=row.type==='income'?'income':'expense';
      return {...row,type,category:bankGuessCategory(row.title,type),icon:bankCategoryIcon(bankGuessCategory(row.title,type),type),include:row.type!=='transfer',rowId:index,currency:row.currency||appData.currency||'UAH'};
    });
    const summary=document.getElementById('bankImportSummary');
    summary.style.display='block';
    summary.textContent='Найдено операций: '+bankImportRows.length+(data.skipped?' · Пропущено строк без даты/суммы: '+data.skipped:'')+(data.truncated?' · Показаны первые 2000 операций.':'');
    renderBankImportRows();
    status.textContent=bankImportRows.length?'Проверь суммы, типы и категории. Операции с возможными переводами отключены.':'В выписке не найдено операций.';
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
  if(!selected.length){alert('Выбери хотя бы одну корректную операцию.');return;}
  const unique=[],seen=new Set();
  selected.forEach(row=>{row.amount=Number(row.amount);row.currency=String(row.currency||appData.currency||'UAH').toUpperCase();row.icon=bankCategoryIcon(row.category,row.type);row.importFingerprint=bankFingerprint(row);if(!seen.has(row.importFingerprint)){seen.add(row.importFingerprint);unique.push(row);}});
  if(!unique.length)return;
  if(unique.length>500){alert('За один раз можно импортировать не больше 500 операций. Сними галочки с лишних строк и повтори.');return;}
  const currencies=[...new Set(unique.map(r=>String(r.currency||appData.currency||'UAH').toUpperCase()))];
  if(currencies.length>1){alert('В этой выписке несколько валют. Чтобы не исказить баланс, импортируй каждую валюту отдельным файлом.');return;}
  if(currencies[0]!==String(appData.currency||'UAH').toUpperCase()){alert('Валюта выписки — '+currencies[0]+', а валюта приложения — '+String(appData.currency||'UAH')+'. Сначала измени валюту приложения в Настройках на '+currencies[0]+', затем загрузи выписку снова.');return;}
  bankImportBusy=true;const button=document.getElementById('bankImportConfirm');button.disabled=true;button.textContent='Импорт…';
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
    alert('Импорт завершён. Добавлено: '+imported+(duplicates?' · Дубликаты пропущены: '+duplicates:'')+'.');
  }catch(error){alert(error.message||'Не удалось импортировать операции.');}
  finally{bankImportBusy=false;button.disabled=false;button.textContent='Импортировать';}
}

function saveData(){ localStorage.setItem(appStorageKey, JSON.stringify(appData)); }
function t(k){ return (TRANSLATIONS[appData.lang] && TRANSLATIONS[appData.lang][k]) || TRANSLATIONS['ru'][k] || k; }

function fmtMoney(v){
  const c = CURRENCIES.find(x => x.id === appData.currency) || CURRENCIES[0];
  const n = Number(v||0).toLocaleString(appData.lang, { maximumFractionDigits: 2 });
  return ['$','£','€'].includes(c.sym) ? `${c.sym}${n}` : `${n} ${c.sym}`;
}

function applyLang(){
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.getElementById('langLabel').innerText = (LANGS.find(l=>l.id===appData.lang)||LANGS[0]).flag + ' ' + (LANGS.find(l=>l.id===appData.lang)||LANGS[0]).label;
  document.getElementById('currLabel').innerText = (CURRENCIES.find(c=>c.id===appData.currency)||CURRENCIES[0]).sym + ' ' + (CURRENCIES.find(c=>c.id===appData.currency)||CURRENCIES[0]).label;
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
      title: 'Чем удобен «Семейный бюджет»',
      html: '<ul><li><b>В Telegram:</b> бюджет под рукой в привычном мессенджере.</li><li><b>Всё в одном месте:</b> доходы, расходы, история, аналитика и планирование.</li><li><b>Гибкость:</b> несколько валют и языков, категории и финансовые цели.</li><li><b>PRO-инструменты:</b> экспорт подробного отчёта в Excel, собственные категории, персональный фон и напоминания.</li><li><b>Без переплаты сразу:</b> новым пользователям доступен пробный период на 30 дней.</li><li><b>Бонусная система:</b> купон 10% за приглашение и за каждую подтверждённую оплату реферала, а также купон 20% за принятый отзыв.</li><li><b>Удобная оплата:</b> Telegram Stars или USDT через Crypto Pay.</li></ul><p class="help-note">Главная идея — сделать учёт денег быстрым и понятным, чтобы им было проще пользоваться регулярно.</p>'
    },
    plans: {
      title: 'Как выбрать тариф',
      html: '<p><b>Basic</b> подойдёт для ежедневного учёта: доходы, расходы, история, аналитика и планирование.</p><p><b>PRO</b> включает возможности Basic и дополнительные инструменты: свои категории, обои, Excel-экспорт и ежедневные напоминания.</p><p>Длительные тарифы обычно выгоднее в пересчёте на месяц. Перед оплатой проверь срок и цену выбранного тарифа.</p><p class="help-note">Новым пользователям доступно 30 дней пробного периода.</p>'
    },
    basic: {
      title: 'Что входит в Basic',
      html: '<ul><li>Запись доходов и расходов.</li><li>История операций и категории.</li><li>Конверты, счета и финансовые цели.</li><li>Аналитика и прогнозирование расходов.</li><li>Планирование регулярных платежей.</li></ul><p>Это базовый набор для контроля денег без лишних сложностей.</p>'
    },
    pro: {
      title: 'Что даёт PRO',
      html: '<ul><li><b>Всё из Basic.</b></li><li><b>Свои категории:</b> настрой под свои источники дохода и виды расходов.</li><li><b>Персональные обои:</b> измени оформление интерфейса.</li><li><b>Экспорт Excel:</b> сохраняй подробный отчёт и анализируй расходы.</li><li><b>Чеки по фото:</b> добавление фотографии чека; распознавание подключим отдельным этапом.</li><li><b>Ежедневные напоминания:</b> меньше шансов забыть записать траты.</li></ul><p>PRO полезен тем, кто хочет вести бюджет системно и анализировать данные подробнее.</p>'
    },
    coupons: {
      title: 'Как работают купоны',
      html: '<ul><li><b>Купон 10%:</b> начисляется за приглашение нового пользователя, а также по одному за каждую подтверждённую оплату его подписки.</li><li><b>Купон 20%:</b> начисляется за принятый отзыв.</li><li><b>Один купон — одна покупка:</b> выбери купон до оплаты.</li><li><b>Без риска потери:</b> купон списывается только после подтверждения успешной оплаты.</li></ul><p class="help-note">Повторные уведомления об одной и той же оплате не должны создавать дополнительные бонусы.</p>'
    }
  };
  const selected = content[topic] || content.general;
  title.textContent = selected.title;
  body.innerHTML = selected.html;
  openModal('modalHelp');
}

function requestProFeature(feature){
  const message = feature + ' доступно в PRO. Открой тарифы, чтобы получить доступ.';
  const tg = window.Telegram?.WebApp;
  const goToPay = () => { window.location.href = '?screen=pay'; };
  if(tg?.initData && tg.showAlert){
    tg.showAlert(message, goToPay);
  } else {
    alert(message);
    goToPay();
  }
}

let pendingReceiptDraft = null;
let receiptEditingTxId = null;
let editingEnvelopeId = null;
let editingBankId = null;

function openReceiptEntry(){
  receiptEditingTxId = null;
  const receiptSaveButton=document.querySelector('#modalReceiptEntry button[onclick="saveReceiptDraft()"]');
  if(receiptSaveButton)receiptSaveButton.innerHTML='<i class="fa-solid fa-check"></i> Добавить чек к операции';
  if(appData.activeTxType !== 'expense'){
    alert('Чек можно прикрепить только к расходу.');
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
  if(!store){ error.textContent = 'Укажи название магазина.'; return; }
  if(!parsedItems.length){ error.textContent = 'Добавь хотя бы один товар. Формат: Название; цена; количество.'; return; }
  if(!Number.isFinite(total) || total <= 0){ error.textContent = 'Укажи сумму чека или цены товаров.'; return; }
  const draft = {store, date, items:parsedItems, total:Math.round(total*100)/100, source:'manual'};
  if(receiptEditingTxId !== null){
    try{
      const tx = budgetMode==='family' ? familyTransactions.find(item=>String(item.id)===String(receiptEditingTxId)) : appData.history.find(item=>String(item.id)===String(receiptEditingTxId));
      if(!tx) throw new Error('Операция не найдена.');
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
    }catch(e){ if(error)error.textContent=e.message||'Не удалось изменить чек.'; return; }
  }
  pendingReceiptDraft = draft;
  const amountInput = document.getElementById('txAmountInput');
  const commentInput = document.getElementById('txCommentInput');
  if(amountInput) amountInput.value = String(pendingReceiptDraft.total);
  if(commentInput && !commentInput.value.trim()) commentInput.value = store;
  const status = document.getElementById('receiptDraftStatus');
  if(status){ status.style.display = 'block'; status.textContent = '🧾 Чек добавлен: ' + store + ' · ' + pendingReceiptDraft.items.length + ' поз. · ' + fmtMoney(pendingReceiptDraft.total); }
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
  if(saveButton)saveButton.innerHTML='<i class="fa-solid fa-check"></i> Сохранить изменения';
  openModal('modalReceiptEntry');
}

async function deleteReceipt(id){
  const tx = budgetMode==='family' ? familyTransactions.find(item=>String(item.id)===String(id)) : appData.history.find(item=>String(item.id)===String(id));
  if(!tx || !tx.receipt) return;
  if(!window.confirm('Убрать чек? Сам расход останется в истории.')) return;
  try{
    if(budgetMode==='family' && currentFamily){
      await familyRequest('/api/family/transactions/'+encodeURIComponent(String(id)),'PATCH',{receipt:null});
      await loadFamilyTransactions();
    } else {
      tx.receipt=null;
      saveData(); renderAll();
    }
  }catch(e){alert(e.message||'Не удалось удалить чек.');}
}

function openReceiptPhoto(){
  if(!canUseProFeatures){
    requestProFeature('Добавление чека по фото');
    return;
  }
  const picker = document.getElementById('receiptPhotoInput');
  if(picker) picker.click();
}

function handleReceiptPhotoSelected(event){
  const file = event.target.files && event.target.files[0];
  if(!file) return;
  if(!file.type.startsWith('image/')){ alert('Выбери изображение чека.'); event.target.value=''; return; }
  if(file.size > 12 * 1024 * 1024){ alert('Фото должно быть меньше 12 МБ.'); event.target.value=''; return; }
  alert('Фото выбрано. Автоматическое распознавание чека подключим следующим этапом. Сейчас можно добавить чек вручную.');
  event.target.value = '';
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
  const refs = document.getElementById('referralCountValue');
  const c10 = document.getElementById('coupon10CountValue');
  const c20 = document.getElementById('coupon20CountValue');
  const link = document.getElementById('referralLinkInput');
  if(refs) refs.textContent = String(Number(referralStats.count || 0));
  if(c10) c10.textContent = String(Number(referralStats.coupons10 || 0));
  if(c20) c20.textContent = String(Number(referralStats.coupons20 || 0));
  if(link) link.value = referralStats.link || '';
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
  if(stock10) stock10.textContent = count10 > 0 ? 'Доступно купонов: ' + count10 : 'Пока нет купонов';
  if(stock20) stock20.textContent = count20 > 0 ? 'Доступно купонов: ' + count20 : 'Пока нет купонов';
  if(info){
    if(select.value === '10') info.innerHTML = '<i class="fa-solid fa-circle-check"></i><span>Скидка 10% выбрана. Купон спишется после подтверждения оплаты.</span>';
    else if(select.value === '20') info.innerHTML = '<i class="fa-solid fa-circle-check"></i><span>Скидка 20% выбрана. Купон спишется после подтверждения оплаты.</span>';
    else info.innerHTML = '<i class="fa-solid fa-shield-halved"></i><span>Выбери доступный купон или продолжай без скидки. Купон списывается только после оплаты.</span>';
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
    const formattedBase = base.toLocaleString('ru-RU');
    const formattedDiscount = discounted.toLocaleString('ru-RU');
    const suffix = el.dataset.baseStars === '7500' ? ' ⭐ за год' : ' ⭐';
    el.innerHTML = percent
      ? '<span class="price-stars-old">или ' + formattedBase + suffix + '</span><span class="price-stars-current">или ' + formattedDiscount + suffix + '</span>'
      : 'или ' + formattedBase + suffix;
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
    renderReferralStats();
    updateCouponSelector();
  } catch(error){
    console.error('Could not load subscription access:', error);
    canUseProFeatures = false;
  }

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

async function submitTransaction(){
  const amount=parseFloat(document.getElementById('txAmountInput').value);if(!amount||amount<=0)return;
  const title=document.getElementById('txCommentInput').value||tCat(appData.selectedCategory);
  const envelopeSelect=document.getElementById('txEnvelopeSelect');
  const selectedEnvelopeId=appData.activeTxType==='expense'&&envelopeSelect&&envelopeSelect.value?envelopeSelect.value:null;
  if(budgetMode==='family'&&currentFamily){try{await familyRequest('/api/family/transactions','POST',{type:appData.activeTxType,amount,title,category:appData.selectedCategory,icon:appData.currentIcon,date:new Date().toISOString(),currency:appData.currency||'UAH',envelopeId:selectedEnvelopeId,receipt:appData.activeTxType==='expense'?pendingReceiptDraft:null});closeModal('modalTransaction');pendingReceiptDraft=null;await Promise.all([loadFamilyTransactions(),loadFamilyEnvelopes()]);}catch(e){alert(e.message||'Не удалось сохранить семейную операцию.');}return;}
  const envelopeId=selectedEnvelopeId?Number(selectedEnvelopeId):null;
  const tx={id:Date.now(),type:appData.activeTxType,title,category:appData.selectedCategory,icon:appData.currentIcon,amount,envelopeId,date:new Date().toLocaleDateString('ru-RU'),receipt:txTypeReceiptAllowed(appData.activeTxType)?pendingReceiptDraft:null};appData.history.unshift(tx);pendingReceiptDraft=null;
  if(tx.type==='expense'){appData.balance-=amount;appData.monthExpense+=amount;}else{appData.balance+=amount;appData.monthIncome+=amount;}
  saveData();closeModal('modalTransaction');renderAll();
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
  if(!tx){if(error)error.textContent='Операция не найдена.';return;}
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
  if(!window.confirm('Удалить конверт «'+item.name+'»?'))return;
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
  const item=appData.banks.find(x=>String(x.id)===String(id));if(!item)return;
  editingBankId=id;
  document.getElementById('bankNameInput').value=item.name||'';
  document.getElementById('bankTargetInput').value=item.target||'';
  document.getElementById('bankDeadlineInput').value=item.deadline||'';
  const title=document.querySelector('#modalAddBank .modal-header h3');if(title)title.textContent='Изменить копилку';
  const btn=document.querySelector('#modalAddBank button[onclick="saveBank()"]');if(btn)btn.textContent='Сохранить изменения';
  openModal('modalAddBank');
}
function deleteBank(id){
  const item=appData.banks.find(x=>String(x.id)===String(id));if(!item)return;
  if(!window.confirm('Удалить копилку «'+item.name+'»?'))return;
  appData.banks=appData.banks.filter(x=>String(x.id)!==String(id));
  if(String(selectedBankIdForContribution)===String(id))selectedBankIdForContribution=null;
  saveData();renderAll();
}

function saveBank(){
  const name = document.getElementById('bankNameInput').value.trim();
  const target = parseFloat(document.getElementById('bankTargetInput').value);
  const deadline = document.getElementById('bankDeadlineInput').value || null;
  if(!name || !Number.isFinite(target) || target <= 0) return;
  if(editingBankId!==null){
    const bank=appData.banks.find(item=>String(item.id)===String(editingBankId));
    if(bank){bank.name=name;bank.target=target;bank.deadline=deadline;}
    editingBankId=null;
  }else appData.banks.push({ id: Date.now(), name, target, balance: 0, deadline });
  document.getElementById('bankNameInput').value='';
  document.getElementById('bankTargetInput').value='';
  document.getElementById('bankDeadlineInput').value='';
  const bankTitle=document.querySelector('#modalAddBank .modal-header h3');if(bankTitle)bankTitle.textContent='Новая банка';
  const bankBtn=document.querySelector('#modalAddBank button[onclick="saveBank()"]');if(bankBtn)bankBtn.textContent='Создать';
  saveData(); closeModal('modalAddBank'); renderAll();
}

let selectedBankIdForContribution = null;
function contributeToBank(id){
  if(budgetMode==='family'){alert('Семейные копилки пока не подключены к общему хранилищу.');return;}
  const bank=appData.banks.find(item=>String(item.id)===String(id));
  if(!bank)return;
  selectedBankIdForContribution=bank.id;
  document.getElementById('bankContributionTitle').textContent='Пополнить: '+bank.name;
  document.getElementById('bankContributionAmount').value='';
  document.getElementById('bankContributionHint').textContent='Доступно на личном балансе: '+fmtMoney(appData.balance);
  openModal('modalBankContribution');
}
function saveBankContribution(){
  const bank=appData.banks.find(item=>String(item.id)===String(selectedBankIdForContribution));
  const amount=Number(document.getElementById('bankContributionAmount').value);
  if(!bank||!Number.isFinite(amount)||amount<=0){alert('Введи сумму больше нуля.');return;}
  if(amount>appData.balance){alert('На личном балансе недостаточно денег.');return;}
  appData.balance-=amount;
  bank.balance=Number(bank.balance||0)+amount;
  bank.contributions=Array.isArray(bank.contributions)?bank.contributions:[];
  bank.contributions.push({amount,date:new Date().toLocaleDateString('ru-RU')});
  selectedBankIdForContribution=null;
  saveData();closeModal('modalBankContribution');renderAll();
}

function saveRecurring(){
  const name = document.getElementById('recName').value;
  const amount = parseFloat(document.getElementById('recAmount').value);
  const day = parseInt(document.getElementById('recDay').value) || 1;
  if(!name || !amount) return;
  appData.recurring.push({ name, amount, day, lastRun: '' });
  saveData(); closeModal('modalAddRecurring'); renderAll();
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
      <span>${it.label}</span>
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
let familyEnvelopesBusy = false;
let familyTransactionsBusy = false;
let budgetMode = localStorage.getItem('budgetMode_' + telegramUserId) === 'family' ? 'family' : 'personal';
function updateBudgetModeControls(){
 const sw=document.getElementById('budgetModeSwitch'); if(sw)sw.style.display=currentFamily?'flex':'none';
 const p=document.getElementById('budgetModePersonal'),f=document.getElementById('budgetModeFamily');
 if(p)p.classList.toggle('active',budgetMode==='personal');if(f)f.classList.toggle('active',budgetMode==='family');
 if(!currentFamily&&budgetMode==='family'){budgetMode='personal';localStorage.setItem('budgetMode_'+telegramUserId,'personal');}
}
function setBudgetMode(mode){if(!['personal','family'].includes(mode)||(mode==='family'&&!currentFamily))return;budgetMode=mode;localStorage.setItem('budgetMode_'+telegramUserId,mode);updateBudgetModeControls();if(mode==='family')loadFamilyTransactions();renderAll();}
async function loadFamilyTransactions(){if(!currentFamily||familyTransactionsBusy)return;familyTransactionsBusy=true;try{const r=await familyRequest('/api/family/transactions');familyTransactions=Array.isArray(r.transactions)?r.transactions:[];}catch(e){familyFeedback(e.message||'Не удалось загрузить семейные операции.',true);}finally{familyTransactionsBusy=false;renderAll();}}
async function loadFamilyEnvelopes(){if(!currentFamily||familyEnvelopesBusy)return;familyEnvelopesBusy=true;try{const r=await familyRequest('/api/family/envelopes');familyEnvelopes=Array.isArray(r.envelopes)?r.envelopes:[];}catch(e){familyFeedback(e.message||'Не удалось загрузить семейные конверты.',true);}finally{familyEnvelopesBusy=false;renderAll();}}
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
  if(currentFamily){loadFamilyEnvelopes();if(budgetMode==='family')loadFamilyTransactions();}
  const status = document.getElementById('familyStatus');
  const currentInfo = document.getElementById('familyCurrentInfo');
  const emptyInfo = document.getElementById('familyEmptyInfo');
  const actions = document.getElementById('familyActionButtons');
  const leaveBtn = document.getElementById('familyLeaveBtn');

  if(!family){
    if(status) status.textContent = 'Ты пока не состоишь в семейной группе.';
    if(currentInfo) currentInfo.style.display = 'none';
    if(emptyInfo) emptyInfo.style.display = 'block';
    if(actions) actions.style.display = 'grid';
    if(leaveBtn) leaveBtn.style.display = 'none';
    hideFamilyForms();
    return;
  }

  const members = family.members && typeof family.members === 'object'
    ? family.members : {};
  if(status) status.textContent = 'Семейная группа активна';
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
    countNode.textContent = 'Участников: ' + count + (family.currentRole === 'owner' ? ' · Ты организатор' : '');
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
  const code = (input?.value || '').replace(/\\s+/g, '').toUpperCase();
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
    if(tg?.showAlert) tg.showAlert('Реферальная ссылка скопирована!');
    else alert('Реферальная ссылка скопирована!');
  } catch(error){
    const input = document.getElementById('referralLinkInput');
    if(input){ input.focus(); input.select(); }
    const tg = window.Telegram?.WebApp;
    if(tg?.showAlert) tg.showAlert('Не удалось скопировать автоматически. Выдели ссылку и скопируй её вручную.');
    else alert('Не удалось скопировать автоматически. Выдели ссылку и скопируй её вручную.');
  }
}

async function copyFamilyCode(){
  const code = currentFamily?.id;
  if(!code) return;
  try{
    await navigator.clipboard.writeText(code);
    familyFeedback('Код ' + code + ' скопирован. Отправь его участнику семьи.');
  } catch(error){
    familyFeedback('Не удалось скопировать автоматически. Код: ' + code, true);
  }
}

async function leaveFamily(){
  if(familyBusy || !currentFamily) return;
  const name = currentFamily.name || 'семья';
  const confirmed = confirm(
    'Выйти из группы «' + name + '»?\\n\\n' +
    'Твои личные записи бюджета, баланс, история, конверты и счета останутся на устройстве. ' +
    'Если ты организатор, роль перейдёт другому участнику. Семейные данные не будут удалены.'
  );
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
          text: `${t('income')} / ${t('expense')} — 6 месяцев`,
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
    node.innerHTML='<div class="pro-insights-lock"><div class="pro-insights-lock-icon">✦</div><div><b>Расширенная аналитика PRO</b><p>Сравнение с прошлым месяцем, топ категорий, средние дневные траты и прогноз до конца месяца.</p><button class="btn btn-accent btn-sm" onclick="switchTab(\'pay\')">Открыть PRO</button></div></div>';
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
    return '<div class="pro-insight-category"><div class="pro-insight-category-top"><span><i>'+String(i+1)+'</i>'+bankEscape(tCat(name))+'</span><b>'+fmtMoney(amount)+'</b></div><div class="progress-track"><div class="progress-fill" style="width:'+pct+'%"></div></div><small>'+pct+'% расходов за месяц</small></div>';
  }).join(''):'<p class="muted">Пока нет расходов за текущий месяц — добавь операции, и здесь появится анализ.</p>';
  const compareText=difference===null?'Нет данных за прошлый месяц':(difference>0?'Расходы выросли на ':'Расходы снизились на ')+Math.abs(Math.round(difference))+'% к прошлому месяцу';
  const compareClass=difference===null?'neutral':difference>0?'negative':'positive';
  node.innerHTML='<div class="pro-insights-head"><div><span class="pro-insights-eyebrow">PRO ANALYTICS</span><h4>Финансовая картина</h4><p>На основе операций текущего и прошлого месяца</p></div><span class="pro-insights-crown">♛</span></div>'+
    '<div class="pro-insights-metrics">'+
      '<div class="pro-insight-metric"><span>Прогноз расходов</span><b>'+fmtMoney(projected)+'</b><small>к концу месяца</small></div>'+
      '<div class="pro-insight-metric"><span>В среднем в день</span><b>'+fmtMoney(currentExpense/day)+'</b><small>за '+day+' дн. текущего месяца</small></div>'+
      '<div class="pro-insight-metric"><span>Доходы за месяц</span><b>'+fmtMoney(currentIncome)+'</b><small>по записанным операциям</small></div>'+
      '<div class="pro-insight-metric"><span>Траты за месяц</span><b>'+fmtMoney(currentExpense)+'</b><small>из '+daysInMonth+' дней</small></div>'+
    '</div>'+
    '<div class="pro-insight-comparison '+compareClass+'"><span>Сравнение с прошлым месяцем</span><b>'+bankEscape(compareText)+'</b>'+(previousExpense>0?'<small>Прошлый месяц: '+fmtMoney(previousExpense)+'</small>':'')+'</div>'+
    '<div class="pro-insights-categories"><div class="pro-insights-section-title">Куда уходят деньги</div>'+categoryHtml+'</div>'+
    '<p class="pro-insights-note">Прогноз — ориентир по средним расходам с начала месяца, а не гарантия будущих трат.</p>';
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
  const title=document.getElementById('budgetBalanceTitle');if(title)title.textContent=visibleBudget.isFamily?'Общий баланс семьи':'Личный баланс';
  const search=document.getElementById('histSearch'),q=search?search.value.toLowerCase():'';
  const filtered=visibleBudget.history.filter(tx =>
    !q ||
    String(tx.title || '').toLowerCase().includes(q) ||
    tCat(tx.category || '').toLowerCase().includes(q) ||
    String(tx.memberName || '').toLowerCase().includes(q)
  );

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
    }).join('') || '<div class="muted">Пока нет конвертов. Создай конверт, чтобы распределять расходы.</div>';
  }

  const banks = document.getElementById('banksList');
  if(banks){
    banks.innerHTML = appData.banks.map(b => {
      const saved=Number(b.balance||0),target=Number(b.target||0),pct=target>0?Math.min(100,saved/target*100):0;
      let deadlineText = '';
      if(b.deadline){
        const today = new Date(); today.setHours(0,0,0,0);
        const due = new Date(b.deadline + 'T00:00:00');
        const daysLeft = Math.round((due.getTime()-today.getTime())/86400000);
        deadlineText = saved >= target
          ? '✅ Цель достигнута'
          : daysLeft < 0
            ? '⚠️ Дедлайн прошёл на ' + Math.abs(daysLeft) + ' дн.'
            : daysLeft === 0
              ? '⏰ Дедлайн сегодня'
              : '📅 Осталось дней: ' + daysLeft;
      }
      return `<div class="card bank-card">
        <div class="bank-card-top"><b>🏦 ${b.name}</b><span class="bank-saved">${fmtMoney(saved)}</span></div>
        <div class="progress-track"><div class="progress-fill bank-progress" style="width:${pct}%"></div></div>
        <div class="envelope-card-bottom"><span>Цель: ${fmtMoney(target)}</span><span>${Math.round(pct)}%</span></div>
        ${b.deadline ? '<div class="muted" style="font-size:12px;margin:6px 0 10px">Дедлайн: ' + new Date(b.deadline + 'T00:00:00').toLocaleDateString('ru-RU') + ' · ' + deadlineText + '</div>' : ''}
        <div class="manage-card-actions"><button class="btn btn-outline btn-sm" onclick="openBankEditor('${b.id}')"><i class="fa-solid fa-pen"></i> Изменить</button><button class="btn btn-outline btn-sm danger" onclick="deleteBank('${b.id}')"><i class="fa-solid fa-trash"></i> Удалить</button></div>
        <button class="btn btn-outline btn-sm bank-add-btn" onclick="contributeToBank('${b.id}')">＋ Пополнить</button>
      </div>`;
    }).join('') || '<div class="muted">Пока нет копилок. Создай цель накопления.</div>';
  }

  const recurring = document.getElementById('recurringList');
  if(recurring){
    recurring.innerHTML = appData.recurring.length
      ? appData.recurring.map(r =>
          `<div>${r.name}: ${fmtMoney(r.amount)} (${r.day})</div>`
        ).join('')
      : t('no_rules');
  }

  applyLang();
  renderForecast();
  renderProInsights();
  updateProFeatureControls();
}


let appInitialized = false;

function initApp(){
  // Avoid a blank/stale first screen: initialize once, then refresh rendered values.
  if (appInitialized) {
    renderAll();
    return;
  }
  appInitialized = true;

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
  loadFamilyStatus();
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
    alert('Ошибка оплаты: ' + error.message);
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

// Initialize safely whether this file runs before or after DOMContentLoaded.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp, { once: true });
} else {
  initApp();
}

// Refresh after the page is fully loaded or restored from the browser cache.
window.addEventListener('load', renderAll, { once: true });
window.addEventListener('pageshow', renderAll);
