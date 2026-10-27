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
  document.getElementById('tab-' + name).style.display = 'block';
  document.getElementById('nav-' + name).classList.add('active');
  if(name === 'analytics') renderCharts();
  renderAll();
}

function openModal(id){ document.getElementById(id).classList.add('active'); }
function closeModal(id){ document.getElementById(id).classList.remove('active'); }
function openHelp(){ openModal('modalHelp'); }

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
  if(refs) refs.textContent = String(Number(referralStats.count || 0));
  if(c10) c10.textContent = String(Number(referralStats.coupons10 || 0));
  if(c20) c20.textContent = String(Number(referralStats.coupons20 || 0));
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
  } catch(error){
    console.error('Could not load subscription access:', error);
    canUseProFeatures = false;
  }

  updateProFeatureControls();
  applyWallpaper();
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

async function submitTransaction(){
  const amount=parseFloat(document.getElementById('txAmountInput').value);if(!amount||amount<=0)return;
  const title=document.getElementById('txCommentInput').value||tCat(appData.selectedCategory);
  const envelopeSelect=document.getElementById('txEnvelopeSelect');
  const selectedEnvelopeId=appData.activeTxType==='expense'&&envelopeSelect&&envelopeSelect.value?envelopeSelect.value:null;
  if(budgetMode==='family'&&currentFamily){try{await familyRequest('/api/family/transactions','POST',{type:appData.activeTxType,amount,title,category:appData.selectedCategory,icon:appData.currentIcon,date:new Date().toISOString(),currency:appData.currency||'UAH',envelopeId:selectedEnvelopeId});closeModal('modalTransaction');await Promise.all([loadFamilyTransactions(),loadFamilyEnvelopes()]);}catch(e){alert(e.message||'Не удалось сохранить семейную операцию.');}return;}
  const envelopeId=selectedEnvelopeId?Number(selectedEnvelopeId):null;
  const tx={id:Date.now(),type:appData.activeTxType,title,category:appData.selectedCategory,icon:appData.currentIcon,amount,envelopeId,date:new Date().toLocaleDateString('ru-RU')};appData.history.unshift(tx);
  if(tx.type==='expense'){appData.balance-=amount;appData.monthExpense+=amount;}else{appData.balance+=amount;appData.monthIncome+=amount;}
  saveData();closeModal('modalTransaction');renderAll();
}

function deleteTx(id){
  if(budgetMode==='family'){alert('Удаление семейных операций пока недоступно.');return;}
  const tx = appData.history.find(x => x.id === id);
  if(!tx) return;
  if(tx.type === 'expense'){ appData.balance += tx.amount; appData.monthExpense -= tx.amount; }
  else { appData.balance -= tx.amount; appData.monthIncome -= tx.amount; }
  appData.history = appData.history.filter(x => x.id !== id);
  saveData(); renderAll();
}

async function saveEnvelope(){
  const name = document.getElementById('envNameInput').value.trim();
  const target = parseFloat(document.getElementById('envTargetInput').value);
  if(!name || !Number.isFinite(target) || target <= 0) return;
  if(budgetMode==='family'&&currentFamily){
    try{await familyRequest('/api/family/envelopes','POST',{name,target});document.getElementById('envNameInput').value='';document.getElementById('envTargetInput').value='';closeModal('modalAddEnvelope');await loadFamilyEnvelopes();}
    catch(e){alert(e.message||'Не удалось создать семейный конверт.');}
    return;
  }
  appData.envelopes.push({ id: Date.now(), name, target });
  document.getElementById('envNameInput').value='';document.getElementById('envTargetInput').value='';
  saveData(); closeModal('modalAddEnvelope'); renderAll();
}

function saveBank(){
  const name = document.getElementById('bankNameInput').value.trim();
  const target = parseFloat(document.getElementById('bankTargetInput').value);
  const deadline = document.getElementById('bankDeadlineInput').value || null;
  if(!name || !Number.isFinite(target) || target <= 0) return;
  appData.banks.push({ id: Date.now(), name, target, balance: 0, deadline });
  document.getElementById('bankNameInput').value='';
  document.getElementById('bankTargetInput').value='';
  document.getElementById('bankDeadlineInput').value='';
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
        transactions: appData.history,
        currency: appData.currency
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
    return Promise.reject(new Error('Открой Money Mini через Telegram, чтобы управлять семьёй.'));
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
              <div class="history-title">${tx.title || tCat(tx.category || 'Разное')}</div>
              <div class="history-sub">${visibleBudget.isFamily ? ((tx.date ? new Date(tx.date).toLocaleDateString('ru-RU') : '') + (tx.memberName ? ' · ' + tx.memberName : '')) : (tx.date || '')}</div>
            </div>
          </div>
          <div class="history-amount ${tx.type === 'expense' ? 'exp' : 'inc'}">
            ${tx.type === 'expense' ? '-' : '+'}${fmtMoney(tx.amount)}
          </div>
          ${visibleBudget.isFamily ? '' : `<button class="card-del" style="position:static" onclick="deleteTx(${tx.id})">✕</button>`}
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
      body: JSON.stringify({plan})
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
