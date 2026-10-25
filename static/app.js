const LANGS = [{id:'ru',flag:'🇷🇺',label:'Русский'},{id:'uk',flag:'🇺🇦',label:'Українська'},{id:'en',flag:'🇬🇧',label:'English'},{id:'de',flag:'🇩🇪',label:'Deutsch'},{id:'es',flag:'🇪🇸',label:'Español'},{id:'fr',flag:'🇫🇷',label:'Français'},{id:'it',flag:'🇮🇹',label:'Italiano'},{id:'pl',flag:'🇵🇱',label:'Polski'},{id:'tr',flag:'🇹🇷',label:'Türkçe'},{id:'zh',flag:'🇨🇳',label:'中文'}];
const CURRENCIES = [{id:'UAH',sym:'₴',label:'Hryvnia'},{id:'RUB',sym:'₽',label:'Ruble'},{id:'USD',sym:'$',label:'Dollar'},{id:'EUR',sym:'€',label:'Euro'},{id:'PLN',sym:'zł',label:'Zloty'},{id:'GBP',sym:'£',label:'Pound'},{id:'TRY',sym:'₺',label:'Lira'},{id:'CHF',sym:'₣',label:'Franc'},{id:'CZK',sym:'Kč',label:'Krona'},{id:'JPY',sym:'¥',label:'Yen'},{id:'CNY',sym:'元',label:'Yuan'}];

let appData = JSON.parse(localStorage.getItem('budgetApp_v18')) || {
  balance: 0, monthIncome: 0, monthExpense: 0, history: [], envelopes: [], banks: [], recurring: [], customCategories: [],
  selectedCategory: 'Еда', currentIcon: '🍔', lang: 'ru', currency: 'UAH', theme: 'dark', wallpaper: null,
  currentMonth: new Date().getFullYear() + '-' + String(new Date().getMonth()+1).padStart(2,'0')
};

function saveData(){ localStorage.setItem('budgetApp_v18', JSON.stringify(appData)); }
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
  document.getElementById('tab-' + name).style.display = 'block';
  document.getElementById('nav-' + name).classList.add('active');
  if(name === 'analytics') renderCharts();
  renderAll();
}

function openModal(id){ document.getElementById(id).classList.add('active'); }
function closeModal(id){ document.getElementById(id).classList.remove('active'); }
function openHelp(){ openModal('modalHelp'); }

const EXPENSE_CATS = [
  {icon:'🍔',name:'Еда'},{icon:'🛒',name:'Продукты'},{icon:'☕',name:'Кафе'},{icon:'🍕',name:'Фастфуд'},
  {icon:'🚗',name:'Транспорт'},{icon:'🚕',name:'Такси'},{icon:'⛽',name:'Бензин'},{icon:'🚌',name:'Общественный'},
  {icon:'🏠',name:'Дом'},{icon:'💡',name:'Коммуналка'},{icon:'📱',name:'Связь'},{icon:'🌐',name:'Интернет'},
  {icon:'📺',name:'Подписки'},{icon:'💊',name:'Аптека'},{icon:'👕',name:'Одежда'},{icon:'👟',name:'Обувь'},
  {icon:'💇',name:'Красота'},{icon:'🏋️',name:'Спорт'},{icon:'🎬',name:'Кино'},{icon:'🎮',name:'Игры'},
  {icon:'🎉',name:'Досуг'},{icon:'🎁',name:'Подарки'},{icon:'🐾',name:'Питомцы'},{icon:'✈️',name:'Путешествия'},
  {icon:'📚',name:'Образование'},{icon:'🔧',name:'Ремонт'},{icon:'🧴',name:'Хозтовары'},{icon:'💳',name:'Кредит'},
  {icon:'👨‍👧',name:'Алименты'},{icon:'🍷',name:'Алкоголь'},{icon:'🚬',name:'Сигареты'},{icon:'🛍️',name:'Маркетплейсы'},
  {icon:'🏦',name:'Банк/комиссия'},{icon:'📦',name:'Разное'}
];

const INCOME_CATS = [
  {icon:'💰',name:'Зарплата'},{icon:'💵',name:'Аванс'},{icon:'🏆',name:'Премия'},{icon:'💸',name:'Кэшбэк'},
  {icon:'📈',name:'Инвестиции'},{icon:'📊',name:'Дивиденды'},{icon:'💼',name:'Фриланс'},{icon:'🏪',name:'Бизнес'},
  {icon:'🎯',name:'Продажа'},{icon:'🎁',name:'Подарок'},{icon:'🤝',name:'Помощь'},{icon:'🥇',name:'Выигрыш'},
  {icon:'↩️',name:'Возврат'},{icon:'🎓',name:'Стипендия'},{icon:'👴',name:'Пенсия'},{icon:'🪙',name:'Прочее'}
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
  appData.activeTxType = type;

  // Очищаем поля при каждом новом открытии
  document.getElementById('txAmountInput').value = '';
  document.getElementById('txCommentInput').value = '';

  document.getElementById('txModalTitle').innerText =
    type === 'expense' ? t('btn_expense') : t('btn_income');

  const baseCats = type === 'expense' ? EXPENSE_CATS : INCOME_CATS;
  const cats = baseCats.concat(appData.customCategories || []);
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
  const name = document.getElementById('catCustomName').value.trim();
  const icon = document.getElementById('catCustomEmoji').value.trim() || '📦';
  if(!name) return;
  appData.customCategories.push({ name, icon });
  saveData(); closeModal('modalAddCategory'); openTransactionModal(appData.activeTxType);
}

function submitTransaction(){
  const amount = parseFloat(document.getElementById('txAmountInput').value);
  if(!amount || amount <= 0) return;
  const title = document.getElementById('txCommentInput').value || tCat(appData.selectedCategory);
  const tx = {
    id: Date.now(), type: appData.activeTxType, title: title,
    category: appData.selectedCategory, icon: appData.currentIcon, amount, date: new Date().toLocaleDateString('ru-RU')
  };
  appData.history.unshift(tx);
  if(tx.type === 'expense'){ appData.balance -= amount; appData.monthExpense += amount; }
  else { appData.balance += amount; appData.monthIncome += amount; }
  saveData(); closeModal('modalTransaction'); renderAll();
}

function deleteTx(id){
  const tx = appData.history.find(x => x.id === id);
  if(!tx) return;
  if(tx.type === 'expense'){ appData.balance += tx.amount; appData.monthExpense -= tx.amount; }
  else { appData.balance -= tx.amount; appData.monthIncome -= tx.amount; }
  appData.history = appData.history.filter(x => x.id !== id);
  saveData(); renderAll();
}

function saveEnvelope(){
  const name = document.getElementById('envNameInput').value;
  const target = parseFloat(document.getElementById('envTargetInput').value);
  if(!name) return;
  appData.envelopes.push({ id: Date.now(), name, target });
  saveData(); closeModal('modalAddEnvelope'); renderAll();
}

function saveBank(){
  const name = document.getElementById('bankNameInput').value;
  const target = parseFloat(document.getElementById('bankTargetInput').value);
  if(!name) return;
  appData.banks.push({ id: Date.now(), name, target, balance: 0 });
  saveData(); closeModal('modalAddBank'); renderAll();
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
        transactions: appData.history,
        currency: appData.currency
      })
    });

    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.detail || 'Ошибка экспорта');
    }

    tg.showAlert(
      'Excel-файл отправлен тебе в личный чат с ботом.'
    );
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
  if(appData.wallpaper){
    document.body.classList.add('has-wallpaper');
    document.body.style.backgroundImage = `url(${appData.wallpaper})`;
  } else {
    document.body.classList.remove('has-wallpaper');
    document.body.style.backgroundImage = '';
  }
}

function leaveFamily(){
  if(!confirm(t('confirm_delete'))) return;
  appData.balance = 0;
  appData.monthIncome = 0;
  appData.monthExpense = 0;
  appData.history = [];
  appData.envelopes = [];
  appData.banks = [];
  saveData();
  renderAll();
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
  const balance = document.getElementById('totalBalance');
  const income = document.getElementById('monthIncome');
  const expense = document.getElementById('monthExpense');

  if(balance) balance.innerText = fmtMoney(appData.balance);
  if(income) income.innerText = '+' + fmtMoney(appData.monthIncome);
  if(expense) expense.innerText = '-' + fmtMoney(appData.monthExpense);

  const search = document.getElementById('histSearch');
  const q = search ? search.value.toLowerCase() : '';

  const filtered = appData.history.filter(tx =>
    !q ||
    String(tx.title || '').toLowerCase().includes(q) ||
    tCat(tx.category || '').toLowerCase().includes(q)
  );

  const hist = document.getElementById('historyContainer');

  if(hist){
    hist.innerHTML = filtered.length
      ? filtered.map(tx => `
        <div class="history-item">
          <div class="history-left">
            <div class="history-icon">${tx.icon || '📦'}</div>
            <div>
              <div class="history-title">${tx.title || tCat(tx.category || 'Разное')}</div>
              <div class="history-sub">${tx.date || ''}</div>
            </div>
          </div>
          <div class="history-amount ${tx.type === 'expense' ? 'exp' : 'inc'}">
            ${tx.type === 'expense' ? '-' : '+'}${fmtMoney(tx.amount)}
          </div>
          <button class="card-del" style="position:static" onclick="deleteTx(${tx.id})">✕</button>
        </div>
      `).join('')
      : `<div class="muted" style="text-align:center">${t('no_rules')}</div>`;
  }

  const envelopes = document.getElementById('envelopesList');
  if(envelopes){
    envelopes.innerHTML = appData.envelopes.map(e => `
      <div class="card">
        <b>📩 ${e.name}</b><br>
        ${t('limit')}: ${fmtMoney(e.target)}
      </div>
    `).join('');
  }

  const banks = document.getElementById('banksList');
  if(banks){
    banks.innerHTML = appData.banks.map(b => `
      <div class="card">
        <b>🏦 ${b.name}</b><br>
        ${t('goal')}: ${fmtMoney(b.target)}
      </div>
    `).join('');
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
}

function initApp(){
  setTheme(appData.theme || 'dark');
  applyLang();
  applyWallpaper();
  renderAll();

  if(window.Telegram && window.Telegram.WebApp){
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
  }
}

document.addEventListener('DOMContentLoaded', initApp);
