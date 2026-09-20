const sb=(window.supabase&&window.SUPABASE_URL&&window.SUPABASE_ANON_KEY)
  ?window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY):null;

const months=['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
const money=n=>`৳ ${Number(n||0).toLocaleString('bn-BD')}`;
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const q=id=>document.getElementById(id);
let members=[],payments=[],profits=[],expenses=[],assets=[],notices=[],adminUser=null,years=[];
// বার্ষিক হিসাবের মূল নিয়ম: প্রতি সদস্যের জন্য বছরে ১২ মাস × ৳৫০০ = ৳৬,০০০।
// বকেয়া সবসময় বার্ষিক মোট পাওনা থেকে প্রকৃত পরিশোধ বাদ দিয়ে অটোমেটিক গণনা হবে।
const DEFAULT_MONTHLY_REQUIRED=500;
let MONTHLY_REQUIRED=DEFAULT_MONTHLY_REQUIRED;
const MONTHS_PER_YEAR=12;
const YEARLY_REQUIRED=()=>MONTHLY_REQUIRED*MONTHS_PER_YEAR;
let dividendVisibility={};

function detectMonthlyRequired(){
  const first=payments
    .filter(p=>Number(p.paid_amount||0)>0)
    .slice()
    .sort((a,b)=>Number(normalizeYear(a.year))-Number(normalizeYear(b.year))||Number(a.month)-Number(b.month))[0];
  const detected=Number(first?.required_amount||0);
  MONTHLY_REQUIRED=detected>0?detected:DEFAULT_MONTHLY_REQUIRED;
  return MONTHLY_REQUIRED;
}
function getYears(){
  const found=new Set();
  const addYear=y=>{
    const year=String(y??'').trim();
    if(year)found.add(year);
  };
  // প্রতিষ্ঠানের চালু হিসাবের বছরগুলো স্থায়ীভাবে থাকবে; নতুন কোনো বছরে
  // প্রকৃত টাকা/হিসাব থাকলে সেটিও স্বয়ংক্রিয়ভাবে যোগ হবে।
  ['2021','2022','2023','2024'].forEach(addYear);
  payments.forEach(p=>{if(Number(p.paid_amount||0)>0)addYear(p.year)});
  return [...found].sort((a,b)=>Number(a)-Number(b));
}
function fillYearSelect(el,includeAll=false){
  if(!el)return;
  const placeholder='<option value="">-- সাল নির্বাচন করুন --</option>';
  const all=includeAll?'<option value="all">সকল বছর</option>':'';
  el.innerHTML=placeholder+all+years.map(y=>`<option value="${esc(y)}">${esc(y)}</option>`).join('');
}
function fillYearSelectors(){
  years=getYears();
  fillYearSelect(q('personalYear'),true);
  fillYearSelect(q('allMembersYear'),true);
  fillYearSelect(q('paymentManageYear'),true);
  if(q('paymentManageMonth')) q('paymentManageMonth').value='';
  if(q('paymentManageMember')) q('paymentManageMember').value='';
}
function memberSort(a,b){
  const sa=Number(a.serial_no), sb=Number(b.serial_no);
  const aHas=Number.isFinite(sa)&&sa>0, bHas=Number.isFinite(sb)&&sb>0;
  if(aHas&&bHas&&sa!==sb)return sa-sb;
  if(aHas!==bHas)return aHas?-1:1;
  return String(a.name||'').localeCompare(String(b.name||''),'bn');
}
function fillMemberSelectors(){
  const orderedMembers=members.slice().sort(memberSort);
  const opts=orderedMembers.map((m,i)=>`<option value="${esc(m.id)}">${Number(m.serial_no||i+1).toLocaleString('bn-BD')}. ${esc(m.name)}</option>`).join('');
  q('personalMember').innerHTML='<option value="">-- সদস্য নির্বাচন করুন --</option>'+opts;
  q('payMember').innerHTML='<option value="">-- সদস্য নির্বাচন করুন --</option>'+opts;
  const manageMember=q('paymentManageMember');
  if(manageMember){const prev=manageMember.value; manageMember.innerHTML='<option value="">-- সদস্য নির্বাচন করুন --</option>'+opts; if(orderedMembers.some(m=>String(m.id)===String(prev))) manageMember.value=prev;}
}
function selectedYears(year){
  if(year==='all'||!year) return years;
  return [String(year)];
}
// Excel-এর বার্ষিক হিসাব অনুযায়ী প্রতিটি সদস্যের প্রত্যেক হিসাব বছরে
// ১২ মাস × ৳৫০০ = ৳৬,০০০ পাওনা। বকেয়া কখনো Database-এর কোনো
// পুরোনো/ফাঁকা due ফিল্ড থেকে নেওয়া হবে না; প্রকৃত মাসিক জমা থেকেই হিসাব হবে।
function normalizeYear(v){
  return String(v ?? '').trim();
}

// ২০২৫ সালে কোনো সদস্যের মাসিক জমা হয়নি। Database-এ থাকা পুরোনো/ভুল ২০২৫
// payment record যেন কোনো হিসাব বা প্রদর্শনীতে জমা হিসেবে না আসে, তাই শুধু
// হিসাবের স্তরে ২০২৫ সালের payment বাদ দেওয়া হচ্ছে; Database-এর কোনো data
// পরিবর্তন বা delete করা হচ্ছে না।
function isCountablePayment(p){
  return true;
}
function memberPaid(m,year){
  const target = year==='all'||!year ? null : normalizeYear(year);
  return payments
    .filter(p=>isCountablePayment(p) && String(p.member_id)===String(m.id) && (target===null || normalizeYear(p.year)===target))
    .reduce((s,p)=>s+Number(p.paid_amount||0),0);
}
function memberRequired(m,year){
  return selectedYears(year).length * YEARLY_REQUIRED();
}
function memberDue(m,year){
  const paid=memberPaid(m,year);
  return Math.max(memberRequired(m,year)-paid,0);
}
function totalPaid(year){
  const target=year==='all'||!year?null:normalizeYear(year);
  return payments.filter(p=>isCountablePayment(p) && (target===null||normalizeYear(p.year)===target))
    .reduce((s,p)=>s+Number(p.paid_amount||0),0);
}
function totalRequired(year){return members.length*selectedYears(year).length*YEARLY_REQUIRED()}
function totalDue(year){return Math.max(totalRequired(year)-totalPaid(year),0)}
function totalExpense(year){return expenses.filter(e=>!year||year==='all'||Number(normalizeYear(e.year))===Number(normalizeYear(year))).reduce((s,e)=>s+Number(e.amount||0),0)}
function totalProfit(year){return profits.filter(p=>!year||year==='all'||Number(normalizeYear(p.year))===Number(normalizeYear(year))).reduce((s,p)=>s+Number(p.total_profit||0),0)}
function totalAssets(year){return assets.filter(a=>!year||year==='all'||Number(normalizeYear(a.year))===Number(normalizeYear(year))).reduce((s,a)=>s+Number(a.amount||0),0)}
function remainingFund(){return totalPaid('all')+totalProfit('all')-totalExpense('all')}
function remainingDividend(){return Math.max(totalProfit('all')-totalExpense('all'),0)}
function memberDividend(m){
  const total=totalPaid('all'),remaining=remainingDividend();
  if(total<=0||remaining<=0)return 0;
  return remaining*(memberPaid(m,'all')/total);
}
function isDividendPublic(memberId){
  return !!dividendVisibility[String(memberId)];
}
function canViewDividend(memberId){
  return !!adminUser || isDividendPublic(memberId);
}
async function loadDividendVisibility(){
  dividendVisibility={};
  if(!sb)return;
  const {data,error}=await sb.from('member_dividend_visibility').select('member_id,is_public');
  if(error){console.warn('member_dividend_visibility load:',error.message);return;}
  (data||[]).forEach(row=>{dividendVisibility[String(row.member_id)]=!!row.is_public;});
}
async function setDividendVisibility(memberId,isPublic){
  const {error}=await sb.from('member_dividend_visibility').upsert(
    {member_id:memberId,is_public:!!isPublic,updated_at:new Date().toISOString()},
    {onConflict:'member_id'}
  );
  if(error){showMessage('লভ্যাংশের Public/Hidden সংরক্ষণ করা যায়নি। আগে member_dividend_visibility টেবিল ও RLS সেটিংস তৈরি করুন।',false);return false;}
  dividendVisibility[String(memberId)]=!!isPublic;
  renderAdminData();
  showMessage(isPublic?'লভ্যাংশ Public করা হয়েছে ✓':'লভ্যাংশ Hidden করা হয়েছে ✓',true);
  return true;
}
async function setAllDividendVisibility(isPublic){
  const ids=members.map(m=>m.id);
  if(!ids.length){showMessage('কোনো সক্রিয় সদস্য পাওয়া যায়নি।',false);return;}
  const rows=ids.map(id=>({member_id:id,is_public:!!isPublic,updated_at:new Date().toISOString()}));
  const {error}=await sb.from('member_dividend_visibility').upsert(rows,{onConflict:'member_id'});
  if(error){showMessage('সব সদস্যের লভ্যাংশ Public/Hidden করা যায়নি। আগে member_dividend_visibility টেবিল ও RLS সেটিংস তৈরি করুন।',false);return;}
  ids.forEach(id=>{dividendVisibility[String(id)]=!!isPublic;});
  renderAdminData();
  showMessage(isPublic?'সকল সদস্যের লভ্যাংশ Public করা হয়েছে ✓':'সকল সদস্যের লভ্যাংশ Hide করা হয়েছে ✓',true);
}
async function toggleDividendVisibility(memberId){
  await setDividendVisibility(memberId,!isDividendPublic(memberId));
}
function currentFund(){return remainingFund()-totalAssets('all')}
function downloadButton(kind){return `<div class="result-download"><button class="download-btn" type="button" onclick="${kind==='personal'?'downloadPersonalReport()':'downloadAllMembersReport()'}">⬇️ বিস্তারিত হিসাব ডাউনলোড</button></div>`}

async function load(){
  if(!sb){q('totalResult').innerHTML='<div class="empty-state">Supabase configuration পাওয়া যায়নি।</div>';return;}
  q('totalResult').innerHTML='<div class="loading">ডাটা লোড হচ্ছে...</div>';
  // Supabase-এর একবারের select সাধারণত সর্বোচ্চ ১০০০টি row ফেরত দিতে পারে।
  // ২০২১–২০২৪ সালের payments মোট ১৬৩৬টি হওয়ায় একবারে নিলে ২০২৩/২০২৪-এর
  // পরের রেকর্ডগুলো বাদ পড়ে যাচ্ছিল। তাই শুধু payments-এর জন্য সব row page করে নেওয়া হচ্ছে।
  const fetchAllPayments=async()=>{
    const rows=[];
    const pageSize=1000;
    for(let from=0;;from+=pageSize){
      const {data,error}=await sb.from('payments').select('*').order('year').order('month').range(from,from+pageSize-1);
      if(error)return {data:null,error};
      rows.push(...(data||[]));
      if(!data||data.length<pageSize)break;
    }
    return {data:rows,error:null};
  };
  const [m,p,pr,e,a,n]=await Promise.all([
    sb.from('members').select('*').eq('status','active').order('serial_no',{ascending:true,nullsFirst:false}).order('created_at'),
    fetchAllPayments(),
    sb.from('profits').select('*').order('year'),
    sb.from('expenses').select('*').order('date',{ascending:false}),
    sb.from('assets').select('*').eq('status','active').order('date',{ascending:false}),
    sb.from('notices').select('*').eq('status','published').order('publish_date',{ascending:false})
  ]);
  const errors=[m,p,pr,e,a,n].filter(x=>x.error);
  if(errors.length){console.error(...errors.map(x=>x.error));q('totalResult').innerHTML='<div class="empty-state">ডাটা লোড করতে সমস্যা হয়েছে। Supabase/RLS সেটিংস পরীক্ষা করুন।</div>';return;}
  members=m.data||[];payments=p.data||[];profits=pr.data||[];expenses=e.data||[];assets=a.data||[];notices=n.data||[];
  detectMonthlyRequired();
  await loadDividendVisibility();
  fillYearSelectors();fillMemberSelectors();
  renderTotal();renderPersonalTotal();renderProfitExpenseDetails();renderFund();renderNotices();renderAllMembersPreview();
  await checkAdmin();
}

function renderPersonalTotal(){
  const deposit=totalPaid('all'),profit=totalProfit('all'),expense=totalExpense('all'),remaining=deposit+profit-expense;
  q('personalTotalResult').innerHTML=`<div class="report-title"><h3>সংস্থার মোট হিসাব</h3><p>প্রতিষ্ঠার শুরু থেকে সকল বছরের সমন্বিত হিসাব</p></div>
  <div class="summary-grid total-summary">
    <article><span>মোট জমা</span><strong>${money(deposit)}</strong></article>
    <article><span>মোট লভ্যাংশ</span><strong>${money(profit)}</strong></article>
    <article><span>মোট বিবিধ খরচ</span><strong>${money(expense)}</strong></article>
    <article class="highlight"><span>অবশিষ্ট তহবিল</span><strong>${money(remaining)}</strong></article>
  </div>`;
}

function renderPersonal(){
  const y=q('personalYear').value,id=q('personalMember').value;
  q('personalMessage').className='message hidden';
  if(!y||!id){q('personalMessage').textContent='সাল ও সদস্য নির্বাচন করুন।';q('personalMessage').className='message error';return;}
  const m=members.find(x=>String(x.id)===String(id));if(!m)return;
  const label=y==='all'?'সকল বছরের মোট হিসাব':`${y} সালের হিসাব`;
  const detailYears=selectedYears(y);
  const detailRows=detailYears.flatMap(yr=>months.map((monthName,idx)=>{
    const paid=memberMonthPaid(m,yr,idx+1);
    const due=Math.max(MONTHLY_REQUIRED-paid,0);
    return `<tr><td>${esc(yr)}</td><td>${monthName}</td><td>${paid>0?money(paid):'৳ ০'}</td><td>${money(due)}</td></tr>`;
  })).join('');
  let allYearsSummary='';
  if(y==='all'){
    const dividend=memberDividend(m);
    const visible=canViewDividend(m.id);
    allYearsSummary=`<div class="detail-block member-total-detail"><div class="detail-heading"><span>📊</span><h3>সকল বছরের মোট হিসাব</h3></div><div class="summary-grid personal-total-summary">
      <article><span>মোট পরিশোধ</span><strong>${money(memberPaid(m,'all'))}</strong></article>
      <article><span>মোট বাকি</span><strong>${money(memberDue(m,'all'))}</strong></article>
      <article><span>মোট লভ্যাংশ</span><strong>${visible?money(dividend):'গোপন'}</strong></article>
      <article class="highlight"><span>সর্বমোট প্রাপ্য</span><strong>${money(memberPaid(m,'all')+(visible?dividend:0))}</strong></article>
    </div></div>`;
  }else{
    allYearsSummary=`<div class="member-summary compact-summary"><div>মোট পরিশোধ<strong>${money(memberPaid(m,y))}</strong></div><div>মোট বাকি<strong>${money(memberDue(m,y))}</strong></div></div>`;
  }
  q('personalResult').innerHTML=`<div class="report-title"><h3>${esc(m.name)}</h3><p>${label}</p></div>
    <div class="print-only personal-print-details"><h4>মাসভিত্তিক বিস্তারিত হিসাব</h4><div class="table-wrap"><table><thead><tr><th>সাল</th><th>মাস</th><th>পরিশোধ</th><th>বাকি</th></tr></thead><tbody>${detailRows}</tbody></table></div></div>
    ${allYearsSummary}
    ${downloadButton('personal')}`;
  q('personalResult').scrollIntoView({behavior:'smooth',block:'start'});
}

function memberMonthPaid(m,y,month){
  return payments.filter(p=>isCountablePayment(p)&&String(p.member_id)===String(m.id)&&Number(normalizeYear(p.year))===Number(normalizeYear(y))&&Number(p.month)===month).reduce((s,p)=>s+Number(p.paid_amount||0),0);
}
function paidCell(m,y,month){
  const amount=memberMonthPaid(m,y,month);
  return amount>0?Number(amount).toLocaleString('bn-BD'):'';
}
function renderAllMembers(){
  const y=q('allMembersYear').value||'all';
  if(!y){q('allMembersResult').innerHTML='<div class="empty-state">একটি বছর নির্বাচন করে হিসাব দেখুন।</div>';return;}
  if(y==='all'){
    let h=`<div class="report-title"><h3>সকল বছরের সকল সদস্যদের হিসাব</h3><p>যে মাসে টাকা দেওয়া হয়েছে শুধু সেই টাকাই দেখানো হয়েছে</p></div><div class="table-wrap"><table class="member-report-table"><thead><tr><th>ক্রমিক</th><th class="name nowrap">সদস্যের নাম</th>${years.map(v=>`<th>${esc(v)}</th>`).join('')}<th>মোট পরিশোধ</th><th>মোট বাকি</th></tr></thead><tbody>`;
    members.forEach((m,i)=>{h+=`<tr><td>${Number(m.serial_no||i+1).toLocaleString('bn-BD')}</td><td class="name nowrap">${esc(m.name)}</td>`+years.map(v=>`<td>${memberPaid(m,v)>0?Number(memberPaid(m,v)).toLocaleString('bn-BD'):''}</td>`).join('')+`<td>${Number(memberPaid(m,'all')).toLocaleString('bn-BD')}</td><td>${Number(memberDue(m,'all')).toLocaleString('bn-BD')}</td></tr>`});
    h+=`</tbody><tfoot><tr class="total-row"><td colspan="2">সর্বমোট</td>${years.map(v=>`<td>${totalPaid(v)>0?Number(totalPaid(v)).toLocaleString('bn-BD'):''}</td>`).join('')}<td>${Number(totalPaid('all')).toLocaleString('bn-BD')}</td><td>${Number(totalDue('all')).toLocaleString('bn-BD')}</td></tr></tfoot></table></div>${downloadButton('allMembers')}`;
    q('allMembersResult').innerHTML=h;return;
  }
  let h=`<div class="report-title"><h3>${esc(y)} সালের সকল সদস্যদের হিসাব</h3><p>প্রতি মাসে শুধু পরিশোধের পরিমাণ দেখানো হয়েছে</p></div><div class="table-wrap"><table class="member-report-table"><thead><tr><th>ক্রমিক</th><th class="name nowrap">সদস্যের নাম</th>${months.map(m=>`<th>${m}</th>`).join('')}<th>মোট পরিশোধ</th><th>মোট বাকি</th></tr></thead><tbody>`;
  members.forEach((m,i)=>{h+=`<tr><td>${Number(m.serial_no||i+1).toLocaleString('bn-BD')}</td><td class="name nowrap">${esc(m.name)}</td>`+months.map((_,mi)=>`<td>${paidCell(m,y,mi+1)}</td>`).join('')+`<td>${Number(memberPaid(m,y)).toLocaleString('bn-BD')}</td><td>${Number(memberDue(m,y)).toLocaleString('bn-BD')}</td></tr>`});
  h+=`</tbody><tfoot><tr class="total-row"><td colspan="2">সর্বমোট</td>${months.map((_,mi)=>{const x=payments.filter(p=>isCountablePayment(p)&&Number(normalizeYear(p.year))===Number(normalizeYear(y))&&Number(p.month)===mi+1).reduce((s,p)=>s+Number(p.paid_amount||0),0);return `<td>${x>0?Number(x).toLocaleString('bn-BD'):''}</td>`}).join('')}<td>${Number(totalPaid(y)).toLocaleString('bn-BD')}</td><td>${Number(totalDue(y)).toLocaleString('bn-BD')}</td></tr></tfoot></table></div>
  <div class="member-summary"><div>মোট পরিশোধ<strong>${money(totalPaid(y))}</strong></div><div>মোট বাকি<strong>${money(totalDue(y))}</strong></div></div>${downloadButton('allMembers')}`;
  q('allMembersResult').innerHTML=h;
}
function renderAllMembersPreview(){
  const rows=years.map(y=>`<tr><td>${esc(y)}</td><td>${Number(totalPaid(y)).toLocaleString('bn-BD')}</td><td>${Number(totalDue(y)).toLocaleString('bn-BD')}</td></tr>`).join('');
  q('allMembersResult').innerHTML=`<div class="report-title"><h3>সকল সদস্যদের হিসাব</h3><p>সাল নির্বাচন করে বিস্তারিত হিসাব দেখুন</p></div><div class="table-wrap"><table><thead><tr><th>সাল</th><th>মোট পরিশোধ</th><th>মোট বাকি</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderTotal(){
  const deposit=totalPaid('all'),profit=totalProfit('all'),expense=totalExpense('all'),remaining=deposit+profit-expense;
  q('totalResult').innerHTML=`<div class="report-title"><h3>সংস্থার মোট হিসাব</h3><p>প্রতিষ্ঠার শুরু থেকে সকল বছরের সমন্বিত হিসাব</p></div>
  <div class="summary-grid total-summary">
    <article><span>মোট জমা</span><strong>${money(deposit)}</strong></article>
    <article><span>মোট লভ্যাংশ</span><strong>${money(profit)}</strong></article>
    <article><span>মোট বিবিধ খরচ</span><strong>${money(expense)}</strong></article>
    <article class="highlight"><span>অবশিষ্ট তহবিল</span><strong>${money(remaining)}</strong></article>
  </div>`;
}
function renderProfitExpenseDetails(){
  const profitTotal=totalProfit('all'),expenseTotal=totalExpense('all');
  const profitRows=profits.slice().sort((a,b)=>Number(a.year)-Number(b.year)).map((x,i)=>`<tr><td>${(i+1).toLocaleString('bn-BD')}</td><td>${esc(x.year)}</td><td class="detail-text">${esc(x.description||'-')}</td><td>${money(x.total_profit)}</td></tr>`).join('');
  const expenseRows=expenses.slice().sort((a,b)=>Number(a.year||0)-Number(b.year||0)).map((x,i)=>`<tr><td>${(i+1).toLocaleString('bn-BD')}</td><td>${esc(x.year)}</td><td class="detail-text">${esc(x.description||'-')}</td><td>${money(x.amount)}</td></tr>`).join('');
  q('profitExpenseDetailsResult').innerHTML=`
    <div class="detail-block profit-detail"><div class="detail-heading"><span>📈</span><h3>লভ্যাংশের বিস্তারিত বিবরণ</h3></div><div class="table-wrap"><table class="detail-table"><thead><tr><th>ক্রমিক</th><th>সাল</th><th class="detail-text">বিবরণ</th><th>পরিমাণ</th></tr></thead><tbody>${profitRows||'<tr><td colspan="4">কোনো লভ্যাংশের তথ্য নেই।</td></tr>'}</tbody><tfoot><tr class="total-row"><td colspan="3">মোট লভ্যাংশ</td><td>${money(profitTotal)}</td></tr></tfoot></table></div></div>
    <div class="detail-block expense-detail"><div class="detail-heading"><span>🧾</span><h3>খরচের বিস্তারিত বিবরণ</h3></div><div class="table-wrap"><table class="detail-table"><thead><tr><th>ক্রমিক</th><th>সাল</th><th class="detail-text">বিবরণ</th><th>পরিমাণ</th></tr></thead><tbody>${expenseRows||'<tr><td colspan="4">কোনো খরচের তথ্য নেই।</td></tr>'}</tbody><tfoot><tr class="total-row"><td colspan="3">মোট খরচ</td><td>${money(expenseTotal)}</td></tr></tfoot></table></div></div>
    <div class="detail-block dividend-summary-detail"><div class="detail-heading"><span>💰</span><h3>লভ্যাংশের সংক্ষিপ্ত হিসাব</h3></div><div class="table-wrap"><table class="detail-table fund-summary-table"><tbody>
      <tr><th>মোট লভ্যাংশ</th><td>${money(profitTotal)}</td></tr>
      <tr><th>মোট খরচ</th><td>${money(expenseTotal)}</td></tr>
      <tr class="highlight-row"><th>অবশিষ্ট লভ্যাংশ</th><td><b>${money(remainingDividend())}</b></td></tr>
    </tbody></table></div></div>
    `;
}
function renderFund(){
  const deposit=totalPaid('all'),profit=totalProfit('all'),expense=totalExpense('all'),allocated=totalAssets('all'),remaining=currentFund();
  const body=assets.map((a,i)=>`<tr><td>${(i+1).toLocaleString('bn-BD')}</td><td>${esc(a.year)}</td><td>${esc(a.category)}</td><td class="detail-text">${esc(a.description)}</td><td>${money(a.amount)}</td><td>${esc(a.date||'')}</td></tr>`).join('');
  q('fundResult').innerHTML=`<div class="report-title"><h3>তহবিল ব্যবহারের খাতসমূহ</h3><p>যে সকল খাতে তহবিল ব্যবহার করা হয়েছে</p></div>
  <div class="detail-block fund-detail"><div class="detail-heading"><span>🏦</span><h3>তহবিল ব্যবহারের খাতসমূহ</h3></div><div class="table-wrap"><table class="detail-table"><thead><tr><th>ক্রমিক</th><th>সাল</th><th>খাত</th><th class="detail-text">বিস্তারিত</th><th>পরিমাণ</th><th>তারিখ</th></tr></thead><tbody>${body||'<tr><td colspan="6">এখনও কোনো খাত যোগ করা হয়নি।</td></tr>'}</tbody><tfoot><tr class="total-row"><td colspan="4">বিভিন্ন খাতে ব্যবহার করা মোট</td><td>${money(allocated)}</td><td></td></tr></tfoot></table></div></div>
  <div class="detail-block fund-summary-detail"><div class="detail-heading"><span>💰</span><h3>তহবিলের সংক্ষিপ্ত হিসাব</h3></div><div class="table-wrap"><table class="detail-table fund-summary-table"><tbody>
    <tr><th>মোট অবশিষ্ট তহবিল</th><td>${money(remainingFund())}</td></tr><tr><th>বিভিন্ন খাতে ব্যবহার</th><td>${money(allocated)}</td></tr><tr class="highlight-row"><th>বর্তমান অবশিষ্ট তহবিল</th><td><b>${money(currentFund())}</b></td></tr>
  </tbody></table></div></div>`;
}
function renderNotices(){
  const html=notices.map(n=>`<article class="notice"><h3>${esc(n.title)}</h3><p>${esc(n.description)}</p><small>${esc(n.publish_date||'')}</small></article>`).join('');
  q('noticeResult').innerHTML=html||'<div class="empty-state">কোনো প্রকাশিত নোটিশ নেই।</div>';
}
function showMessage(text,ok=false,target='adminMsg'){const el=q(target);if(!el)return;el.textContent=text;el.className='message '+(ok?'success':'error')}
function resetForm(id){const f=q(id);if(!f)return;f.reset();const h=f.querySelector('[name=id]');if(h)h.value=''}
async function saveOrUpdate(table,form,make){const d=Object.fromEntries(new FormData(form).entries()),id=d.id,row=make(d);const res=id?await sb.from(table).update(row).eq('id',id):await sb.from(table).insert(row);if(res.error){showMessage(res.error.message,false);return false}showMessage('সফলভাবে সংরক্ষণ হয়েছে ✓',true);resetForm(form.id);await load();return true}
async function saveMember(){await saveOrUpdate('members',q('memberForm'),d=>({name:d.name.trim(),address:d.address?.trim()||null,mobile:d.mobile||null,status:'active'}))}
async function savePayment(){
  const f=q('paymentForm'),d=Object.fromEntries(new FormData(f).entries());
  const startMonth=Number(d.month),monthCount=Math.max(1,Number(d.month_count||1)),totalAmount=Number(d.paid_amount||0),year=Number(d.year);
  if(!d.id && startMonth+monthCount-1>12){showMessage('নির্বাচিত মাস থেকে যত মাস দিয়েছেন তা একই বছরের ডিসেম্বরের মধ্যে হতে হবে।',false);return}
  if(d.id){
    const row={member_id:d.member_id,year,month:startMonth,required_amount:MONTHLY_REQUIRED,paid_amount:totalAmount,payment_date:null};
    const res=await sb.from('payments').update(row).eq('id',d.id);
    if(res.error){showMessage(res.error.message,false);return}
    showMessage('মাসিক জমা সংরক্ষণ হয়েছে ✓',true);resetForm('paymentForm');await load();return;
  }
  const monthList=Array.from({length:monthCount},(_,i)=>startMonth+i);
  const existing=await sb.from('payments').select('id,month,paid_amount').eq('member_id',d.member_id).eq('year',year).in('month',monthList);
  if(existing.error){showMessage(existing.error.message,false);return}
  const existingRows=existing.data||[];
  const paidExisting=existingRows.filter(x=>Number(x.paid_amount||0)>0);
  if(paidExisting.length){
    const names=paidExisting.map(x=>months[Number(x.month)-1]).join(', ');
    showMessage(`এই সদস্যের ${year} সালের ${names} মাসের জমা আগে থেকেই আছে। কোনো তথ্য পরিবর্তন করা হয়নি।`,false);return;
  }
  const totalCents=Math.round(totalAmount*100),baseCents=Math.floor(totalCents/monthCount),remainder=totalCents-baseCents*monthCount;
  const updateRows=[],insertRows=[];
  monthList.forEach((month,i)=>{
    const amount=(baseCents+(i===monthCount-1?remainder:0))/100;
    const found=existingRows.find(x=>Number(x.month)===month);
    const row={member_id:d.member_id,year,month,required_amount:MONTHLY_REQUIRED,paid_amount:amount,payment_date:null};
    if(found) updateRows.push({id:found.id,row});
    else insertRows.push(row);
  });
  for(const item of updateRows){
    const res=await sb.from('payments').update(item.row).eq('id',item.id);
    if(res.error){showMessage(res.error.message,false);return}
  }
  if(insertRows.length){
    const res=await sb.from('payments').insert(insertRows);
    if(res.error){showMessage(res.error.message,false);return}
  }
  showMessage(`${monthCount} মাসের জমা একসাথে সংরক্ষণ হয়েছে ✓`,true);resetForm('paymentForm');await load();
}
async function saveProfit(){const d=Object.fromEntries(new FormData(q('profitForm')).entries());const row={year:+d.year,description:d.description.trim(),total_profit:+d.total_profit};const res=d.id?await sb.from('profits').update(row).eq('id',d.id):await sb.from('profits').upsert(row,{onConflict:'year'});if(res.error){showMessage(res.error.message,false);return}showMessage('লভ্যাংশ সংরক্ষণ হয়েছে ✓',true);resetForm('profitForm');await load()}
async function saveExpense(){await saveOrUpdate('expenses',q('expenseForm'),d=>({year:+d.year,description:d.description.trim(),amount:+d.amount}))}
async function saveAsset(){await saveOrUpdate('assets',q('assetForm'),d=>({year:+d.year,date:d.date,category:d.category.trim(),description:d.description.trim(),amount:+d.amount,status:'active'}))}
async function saveNotice(){await saveOrUpdate('notices',q('noticeForm'),d=>({title:d.title.trim(),description:d.description.trim(),status:'published'}))}
async function del(table,id){if(!confirm('এই তথ্যটি মুছে ফেলতে চান?'))return;const {error}=await sb.from(table).delete().eq('id',id);if(error){showMessage(error.message,false);return}showMessage('তথ্য মুছে ফেলা হয়েছে ✓',true);await load()}
function editMember(id){const m=members.find(x=>String(x.id)===String(id));if(!m)return;const f=q('memberForm');f.id.value=m.id;f.name.value=m.name;f.address.value=m.address||'';f.mobile.value=m.mobile||'';openForm('member');f.scrollIntoView({behavior:'smooth',block:'start'})}
function editPayment(id){const p=payments.find(x=>String(x.id)===String(id));if(!p)return;const f=q('paymentForm');f.id.value=p.id;f.member_id.value=p.member_id;f.year.value=p.year;f.month.value=p.month;if(f.month_count)f.month_count.value=1;f.paid_amount.value=p.paid_amount;openForm('payment');f.scrollIntoView({behavior:'smooth',block:'start'})}
function editProfit(id){const x=profits.find(x=>String(x.id)===String(id));if(!x)return;const f=q('profitForm');f.id.value=x.id;f.year.value=x.year;f.description.value=x.description||'';f.total_profit.value=x.total_profit;openForm('profit');f.scrollIntoView({behavior:'smooth',block:'start'})}
function editExpense(id){const x=expenses.find(x=>String(x.id)===String(id));if(!x)return;const f=q('expenseForm');f.id.value=x.id;f.year.value=x.year;f.description.value=x.description;f.amount.value=x.amount;openForm('expense');f.scrollIntoView({behavior:'smooth',block:'start'})}
function editAsset(id){const x=assets.find(x=>String(x.id)===String(id));if(!x)return;const f=q('assetForm');f.id.value=x.id;f.year.value=x.year;f.date.value=x.date;f.category.value=x.category;f.description.value=x.description;f.amount.value=x.amount;openForm('asset');f.scrollIntoView({behavior:'smooth',block:'start'})}
function editNotice(id){const x=notices.find(x=>String(x.id)===String(id));if(!x)return;const f=q('noticeForm');f.id.value=x.id;f.title.value=x.title;f.description.value=x.description;openForm('notice');f.scrollIntoView({behavior:'smooth',block:'start'})}
function renderAdminData(){
  const orderedMembers=members.slice().sort(memberSort);
  q('adminMembers').innerHTML=`<table><thead><tr><th>ক্রম</th><th class="name">নাম</th><th>মোবাইল</th><th>অ্যাকশন</th></tr></thead><tbody>`+orderedMembers.map((m,i)=>`<tr><td>${Number(m.serial_no||i+1).toLocaleString('bn-BD')}</td><td class="name">${esc(m.name)}</td><td>${esc(m.mobile||'-')}</td><td class="row-actions"><button class="small-btn edit" onclick="editMember('${esc(m.id)}')">Edit</button><button class="small-btn del" onclick="del('members','${esc(m.id)}')">Delete</button></td></tr>`).join('')+`</tbody></table>`;
  const selectedYear=q('paymentManageYear').value||'all';
  const selectedMonth=q('paymentManageMonth')?.value||'all';
  const selectedMember=q('paymentManageMember')?.value||'';
  const paymentRows=payments.filter(p=>{
    // ০ টাকার placeholder record database-এ থাকবে, কিন্তু Excel-এর প্রকৃত জমার
    // তালিকার সঙ্গে মিল রেখে Admin management-এ শুধু বাস্তব জমা দেখানো হবে।
    if(Number(p.paid_amount||0)<=0)return false;
    if(selectedYear!=='all' && String(p.year)!==String(selectedYear))return false;
    if(selectedMonth!=='all' && Number(p.month)!==Number(selectedMonth))return false;
    if(selectedMember && String(p.member_id)!==String(selectedMember))return false;
    return true;
  }).slice().sort((a,b)=>{
    const ma=members.find(m=>String(m.id)===String(a.member_id))||{};
    const mb=members.find(m=>String(m.id)===String(b.member_id))||{};
    return memberSort(ma,mb)||Number(a.year)-Number(b.year)||Number(a.month)-Number(b.month);
  });
  q('adminPayments').innerHTML=`<table><thead><tr><th>ক্রম</th><th class="name">সদস্য</th><th>সাল</th><th>মাস</th><th>জমা</th><th>অ্যাকশন</th></tr></thead><tbody>`+paymentRows.map((p,i)=>{const m=members.find(x=>String(x.id)===String(p.member_id))||{};return `<tr><td>${Number(m.serial_no||i+1).toLocaleString('bn-BD')}</td><td class="name">${esc(m.name||'')}</td><td>${esc(p.year)}</td><td>${months[Number(p.month)-1]||''}</td><td>${money(p.paid_amount)}</td><td class="row-actions"><button class="small-btn edit" onclick="editPayment('${esc(p.id)}')">Edit</button><button class="small-btn del" onclick="del('payments','${esc(p.id)}')">Delete</button></td></tr>`}).join('')+`</tbody></table>`;
  q('adminProfits').innerHTML=`<div class="detail-block admin-profit-ledger"><div class="detail-heading"><span>📈</span><h3>লভ্যাংশের মূল হিসাব</h3></div><div class="table-wrap"><table class="detail-table"><thead><tr><th>সাল</th><th class="name">বিবরণ</th><th>লভ্যাংশ</th><th>অ্যাকশন</th></tr></thead><tbody>`+
  profits.map(x=>`<tr><td>${esc(x.year)}</td><td class="name">${esc(x.description||'')}</td><td>${money(x.total_profit)}</td><td class="row-actions"><button class="small-btn edit" onclick="editProfit('${esc(x.id)}')">Edit</button><button class="small-btn del" onclick="del('profits','${esc(x.id)}')">Delete</button></td></tr>`).join('')+
  `</tbody></table></div></div>`;
  q('adminDividendVisibility').innerHTML=`<div class="dividend-global-actions"><button type="button" class="small-btn dividend-public-all" onclick="setAllDividendVisibility(true)">🟢 সকল সদস্যের লভ্যাংশ Public করুন</button><button type="button" class="small-btn dividend-hide-all" onclick="setAllDividendVisibility(false)">🔴 সকল সদস্যের লভ্যাংশ Hide করুন</button></div><table><thead><tr><th>ক্রম</th><th class="name">সদস্য</th><th>মোট জমা</th><th>প্রাপ্য লভ্যাংশ</th><th>অবস্থা</th><th>অ্যাকশন</th></tr></thead><tbody>`+
  orderedMembers.map((m,i)=>`<tr><td>${Number(m.serial_no||i+1).toLocaleString('bn-BD')}</td><td class="name">${esc(m.name)}</td><td>${money(memberPaid(m,'all'))}</td><td>${money(memberDividend(m))}</td><td>${isDividendPublic(m.id)?'<span class="dividend-status public">🟢 Public</span>':'<span class="dividend-status hidden">🔴 Hidden</span>'}</td><td class="row-actions"><button class="small-btn ${isDividendPublic(m.id)?'del':'edit'}" onclick="toggleDividendVisibility('${esc(m.id)}')">${isDividendPublic(m.id)?'Hide':'Public'}</button></td></tr>`).join('')+
  `</tbody></table>`;
  q('adminExpenses').innerHTML=`<table><thead><tr><th>বছর</th><th class="name">বিবরণ</th><th>পরিমাণ</th><th>অ্যাকশন</th></tr></thead><tbody>`+expenses.map(x=>`<tr><td>${esc(x.year)}</td><td class="name">${esc(x.description)}</td><td>${money(x.amount)}</td><td class="row-actions"><button class="small-btn edit" onclick="editExpense('${esc(x.id)}')">Edit</button><button class="small-btn del" onclick="del('expenses','${esc(x.id)}')">Delete</button></td></tr>`).join('')+`</tbody></table>`;
  q('adminAssets').innerHTML=`<table><thead><tr><th>বছর</th><th>খাত</th><th class="name">বিবরণ</th><th>পরিমাণ</th><th>অ্যাকশন</th></tr></thead><tbody>`+assets.map(x=>`<tr><td>${esc(x.year)}</td><td>${esc(x.category)}</td><td class="name">${esc(x.description)}</td><td>${money(x.amount)}</td><td class="row-actions"><button class="small-btn edit" onclick="editAsset('${esc(x.id)}')">Edit</button><button class="small-btn del" onclick="del('assets','${esc(x.id)}')">Delete</button></td></tr>`).join('')+`</tbody></table>`;
  q('adminNotices').innerHTML=`<table><thead><tr><th>শিরোনাম</th><th class="name">বিবরণ</th><th>তারিখ</th><th>অ্যাকশন</th></tr></thead><tbody>`+notices.map(x=>`<tr><td>${esc(x.title)}</td><td class="name">${esc(x.description)}</td><td>${esc(x.publish_date||'')}</td><td class="row-actions"><button class="small-btn edit" onclick="editNotice('${esc(x.id)}')">Edit</button><button class="small-btn del" onclick="del('notices','${esc(x.id)}')">Delete</button></td></tr>`).join('')+`</tbody></table>`;
}
async function checkAdmin(){if(!sb)return;const {data:{session}}=await sb.auth.getSession();adminUser=session?.user||null;if(!adminUser){q('loginBox').hidden=false;q('adminBox').hidden=true;return}const {data,error}=await sb.from('admin_users').select('user_id').eq('user_id',adminUser.id).maybeSingle();if(error||!data){q('loginBox').hidden=false;q('adminBox').hidden=true;q('loginMsg').textContent='এই অ্যাকাউন্টে অ্যাডমিন অনুমতি নেই।';return}q('loginBox').hidden=true;q('adminBox').hidden=false;q('adminUser').textContent=adminUser.email||'Admin';loadDividendVisibility().then(()=>renderAdminData())}
async function login(){if(!sb){showMessage('Supabase configuration পাওয়া যায়নি।',false,'loginMsg');return}showMessage('লগইন হচ্ছে...',true,'loginMsg');const {error}=await sb.auth.signInWithPassword({email:q('adminEmail').value.trim(),password:q('adminPassword').value});if(error){showMessage(error.message,false,'loginMsg');return}await checkAdmin();q('adminPassword').value=''}
async function logout(){await sb.auth.signOut();location.hash='admin';location.reload()}
function openForm(name){document.querySelectorAll('.admin-form').forEach(f=>f.classList.remove('active'));const f=q(name+'Form');if(f)f.classList.add('active')}
function openManagement(name){document.querySelectorAll('.admin-data').forEach(x=>x.classList.remove('active'));q('managementArea').style.display='block';const target=q('manage'+name.charAt(0).toUpperCase()+name.slice(1));if(target)target.classList.add('active');if(name==='payments'||name==='profits'||name==='dividendVisibility')renderAdminData()}
function setMenu(open){const menu=q('mobileMenu'),overlay=q('menuOverlay'),btn=q('menuBtn');menu.classList.toggle('open',open);overlay.classList.toggle('show',open);btn.setAttribute('aria-expanded',String(open));document.body.classList.toggle('menu-open',open)}
function openMainMenu(){setMenu(true)}
function route(){const id=(location.hash||'#personal').slice(1);const valid=['personal','members','due','profitExpenseDetails','fund','notices','admin'];const active=valid.includes(id)?id:'personal';document.querySelectorAll('.page-section').forEach(s=>s.classList.toggle('active',s.id===active));document.querySelectorAll('#mobileMenu a[data-view]').forEach(a=>a.classList.toggle('active',a.dataset.view===active));setMenu(false)}
function printSection(id){
  const target=q(id);
  if(!target)return;

  // Build a dedicated report-only print root directly under <body>.
  // Android Chrome can snapshot the normal page if the print DOM is nested
  // inside <main>, so the non-report body children are also hidden inline.
  document.querySelectorAll('.print-section').forEach(x=>x.remove());

  const printSectionEl=document.createElement('section');
  printSectionEl.id='__printRoot';
  printSectionEl.className='print-section';
  const clone=target.cloneNode(true);
  clone.removeAttribute('id');
  clone.classList.add('print-target');
  clone.querySelectorAll('.result-print').forEach(x=>x.remove());

  if(id==='personalResult'){
    const summary=clone.querySelector('.compact-summary');
    const details=clone.querySelector('.personal-print-details');
    if(summary&&details)details.after(summary);
  }

  const header=document.createElement('div');
  header.className='print-header-generated';
  header.innerHTML='<h1>আল ইখওয়ান ইসলামী সংস্থা বাংলাদেশ</h1><p>বানিপুর, কেন্দুয়া, নেত্রকোনা, মোমেনশাহী, ঢাকা</p>';
  clone.prepend(header);
  printSectionEl.appendChild(clone);
  document.body.appendChild(printSectionEl);

  const bodyChildren=Array.from(document.body.children);
  const hiddenChildren=[];
  bodyChildren.forEach(el=>{
    if(el===printSectionEl)return;
    hiddenChildren.push({el,display:el.style.display});
    el.style.display='none';
  });
  printSectionEl.style.display='block';
  document.body.classList.add('printing-report');

  let cleaned=false;
  const cleanup=()=>{
    if(cleaned)return;
    cleaned=true;
    hiddenChildren.forEach(item=>{item.el.style.display=item.display});
    try{printSectionEl.remove()}catch(e){}
    document.body.classList.remove('printing-report');
  };

  const waitForReady=async()=>{
    try{if(document.fonts&&document.fonts.ready)await document.fonts.ready}catch(e){}
    const images=Array.from(clone.querySelectorAll('img'));
    await Promise.all(images.map(img=>{
      if(img.complete)return Promise.resolve();
      return new Promise(resolve=>{
        const done=()=>{img.removeEventListener('load',done);img.removeEventListener('error',done);resolve()};
        img.addEventListener('load',done,{once:true});
        img.addEventListener('error',done,{once:true});
      });
    }));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  };

  waitForReady().then(()=>{
    void printSectionEl.offsetHeight;
    setTimeout(()=>{
      try{
        window.focus();
        window.print();
        // Keep the print-only DOM alive briefly because Android Chrome may
        // fire afterprint before its preview snapshot has fully completed.
        setTimeout(cleanup,12000);
      }catch(e){
        cleanup();
        showMessage('PDF/Print চালু করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।',false);
      }
    },500);
  });
}

function reportShell(title,subtitle,body,landscape=false){
  return `<!doctype html><html lang="bn"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
  *{box-sizing:border-box}body{margin:0;padding:24px;background:#fff;color:#17221f;font-family:Arial,"Noto Sans Bengali","Noto Sans",sans-serif}
  .report{max-width:${landscape?'1700px':'900px'};margin:0 auto}.head{text-align:center;margin-bottom:18px}.head h1{margin:0;font-size:28px;font-weight:800}.head p{margin:5px 0 0;font-size:13px;color:#65736e}.title{text-align:center;margin-bottom:18px}.title h2{margin:0 0 5px;font-size:22px}.title p{margin:0;font-size:13px;color:#65736e}
  .meta{display:grid;grid-template-columns:2fr 1fr;gap:10px;margin-bottom:14px}.meta>div{border:1px solid #d6e2dd;padding:8px 10px;border-radius:6px}.meta span{display:block;font-size:11px;color:#687772}.meta strong{display:block;margin-top:2px;font-size:14px}
  .table-wrap{width:100%;overflow-x:auto}table{width:100%;border-collapse:collapse;background:#fff}th,td{border:1px solid #c9d6d1;text-align:center;padding:4px 3px;font-size:10px;line-height:1.2;white-space:nowrap}th{font-weight:800;background:#f0f6f3}td.name,th.name{text-align:left;white-space:nowrap}.personal-report-table th,.personal-report-table td{padding-top:6px;padding-bottom:6px}.total-row td{font-weight:800;background:#f6faf8}.all-members-report-table{table-layout:fixed}.all-members-report-table .col-serial{width:4%}.all-members-report-table .col-name{width:14%}.all-members-report-table .col-total{width:8%}.all-members-report-table .col-due{width:8%}.all-members-report-table .col-year{width:15%}.all-members-report-table .col-month{width:5.5%}.all-members-report-table.all-years-report-table .col-total{width:11%}.all-members-report-table.all-years-report-table .col-due{width:11%}.all-members-report-table thead.report-table-head th{background:#e7f3ed;text-align:center!important}.all-members-report-table th:first-child,.all-members-report-table td:first-child{padding-left:1px;padding-right:1px}.all-members-report-table th.name,.all-members-report-table td.name{width:auto;white-space:nowrap;text-align:left;overflow:hidden;text-overflow:ellipsis}
  .summary{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}.summary>div{border:1px solid #cfded8;border-radius:7px;padding:9px;text-align:center;background:#f7fbf9}.summary span{display:block;font-size:11px;color:#63716c}.summary strong{display:block;margin-top:3px;font-size:17px}
  .download-note{margin-top:16px;text-align:center;font-size:11px;color:#687772}@media print{@page{margin:10mm}.report{max-width:none!important}.head{margin-top:0}.table-wrap{overflow:visible!important}table{width:100%!important;table-layout:fixed}thead{display:table-row-group!important}tfoot{display:table-row-group!important}.total-row{break-inside:avoid!important;page-break-inside:avoid!important}.summary{break-inside:avoid!important;page-break-inside:avoid!important}.pdf-landscape{page-break-before:auto}.pdf-landscape table{font-size:8px!important}.pdf-landscape th,.pdf-landscape td{font-size:8px!important;padding:3px 2px!important}}@media(max-width:600px){body{padding:8px}.head h1{font-size:22px}.title h2{font-size:18px}.meta{grid-template-columns:1fr}.report{max-width:none}th,td{font-size:9px;padding:3px 2px}}
</style></head><body><main class="report"><div class="head"><h1>আল ইখওয়ান ইসলামী সংস্থা বাংলাদেশ</h1><p>বানিপুর, কেন্দুয়া, নেত্রকোনা, মোমেনশাহী, ঢাকা</p></div><div class="title"><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div>${body}</main></body></html>`;
}
function downloadHtmlFile(filename,html){
  const blob=new Blob([html],{type:'text/html;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function downloadPersonalReport(){
  const y=q('personalYear').value,id=q('personalMember').value;
  if(!y||!id){showMessage('আগে সাল ও সদস্য নির্বাচন করে অনুসন্ধান করুন।',false);return;}
  const m=members.find(x=>String(x.id)===String(id));if(!m)return;

  if(y==='all'){
    const rows=years.map(yr=>{
      const monthCells=months.map((_,mi)=>`<td>${paidCell(m,yr,mi+1)}</td>`).join('');
      return `<tr><td>${esc(yr)}</td>${monthCells}<td>${money(memberPaid(m,yr))}</td><td>${money(memberDue(m,yr))}</td></tr>`;
    }).join('');
    const body=`<div class="table-wrap"><table class="personal-report-table"><thead><tr><th>সাল</th>${months.map(monthName=>`<th>${monthName}</th>`).join('')}<th>মোট পরিশোধ</th><th>মোট বাকি</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="summary"><div><span>মোট পরিশোধ</span><strong>${money(memberPaid(m,'all'))}</strong></div><div><span>মোট বাকি</span><strong>${money(memberDue(m,'all'))}</strong></div><div><span>মোট লভ্যাংশ</span><strong>${canViewDividend(m.id)?money(memberDividend(m)):'গোপন'}</strong></div><div><span>সর্বমোট প্রাপ্য</span><strong>${money(memberPaid(m,'all')+(canViewDividend(m.id)?memberDividend(m):0))}</strong></div></div>`;
    downloadHtmlFile(`personal-all-${String(m.name).replace(/[^\u0980-\u09FFa-zA-Z0-9_-]+/g,'-')}.html`,reportShell(`${esc(m.name)} - সকল বছরের হিসাব`,'মাসভিত্তিক সকল বছরের হিসাব',body,false));
    return;
  }

  const detailRows=months.map((monthName,idx)=>{
    const paid=memberMonthPaid(m,y,idx+1),due=Math.max(MONTHLY_REQUIRED-paid,0);
    return `<tr><td>${monthName}</td><td>${paid>0?Number(paid).toLocaleString('bn-BD'):'০'}</td><td>${Number(due).toLocaleString('bn-BD')}</td></tr>`;
  }).join('');
  const body=`<div class="table-wrap"><table class="personal-report-table"><thead><tr><th>মাস</th><th>মোট পরিশোধ</th><th>মোট বাকি</th></tr></thead><tbody>${detailRows}</tbody><tfoot><tr class="total-row"><td>সর্বমোট</td><td>${money(memberPaid(m,y))}</td><td>${money(memberDue(m,y))}</td></tr></tfoot></table></div><div class="summary"><div><span>মোট পরিশোধ</span><strong>${money(memberPaid(m,y))}</strong></div><div><span>মোট বাকি</span><strong>${money(memberDue(m,y))}</strong></div></div>`;
  downloadHtmlFile(`personal-${String(y).replace(/[^0-9a-zA-Z_-]/g,'')}-${String(m.name).replace(/[^\u0980-\u09FFa-zA-Z0-9_-]+/g,'-')}.html`,reportShell(`${esc(m.name)} - ব্যক্তিগত হিসাব`,'মাসভিত্তিক বিস্তারিত হিসাব',body,false));
}
function reportColumnWidths(type='years'){
  const serialWidth=4;
  const nameLength=Math.max(4,...members.map(m=>String(m.name||'').trim().length||4));
  const nameWidth=Math.min(22,Math.max(18,16+(nameLength-12)*0.25));
  const remaining=100-serialWidth-nameWidth;
  if(type==='years'){
    const yearWidth=remaining/(years.length+2);
    const totalWidth=yearWidth;
    return {serialWidth,nameWidth,yearWidth,totalWidth};
  }
  const monthWidth=remaining/(months.length+2);
  const totalWidth=monthWidth;
  return {serialWidth,nameWidth,monthWidth,totalWidth};
}
function downloadAllMembersReport(){
  const y=q('allMembersYear').value||'all';
  if(!y){showMessage('আগে একটি সাল নির্বাচন করে হিসাব দেখুন।',false);return;}
  if(y==='all'){
    let rows='';
    members.forEach((m,i)=>{rows+=`<tr><td>${Number(m.serial_no||i+1).toLocaleString('bn-BD')}</td><td class="name">${esc(m.name)}</td>`+years.map(v=>`<td>${memberPaid(m,v)>0?Number(memberPaid(m,v)).toLocaleString('bn-BD'):''}</td>`).join('')+`<td>${money(memberPaid(m,'all'))}</td><td>${money(memberDue(m,'all'))}</td></tr>`});
    const totalCells=years.map(v=>`<td>${totalPaid(v)>0?Number(totalPaid(v)).toLocaleString('bn-BD'):''}</td>`).join('');
    const widths=reportColumnWidths('years');
    const body=`<div class="table-wrap"><table class="all-members-report-table all-years-report-table"><colgroup><col class="col-serial" style="width:${widths.serialWidth}%"><col class="col-name" style="width:${widths.nameWidth}%">${years.map(()=>`<col class="col-year" style="width:${widths.yearWidth}%">`).join('')}<col class="col-total" style="width:${widths.totalWidth}%"><col class="col-due" style="width:${widths.totalWidth}%"></colgroup><thead class="report-table-head"><tr><th>ক্রমিক</th><th class="name">সদস্যের নাম</th>${years.map(v=>`<th>${esc(v)}</th>`).join('')}<th>মোট পরিশোধ</th><th>মোট বাকি</th></tr></thead><tbody>${rows}</tbody><tfoot><tr class="total-row"><td colspan="2">সর্বমোট</td>${totalCells}<td>${Number(totalPaid('all')).toLocaleString('bn-BD')}</td><td>${Number(totalDue('all')).toLocaleString('bn-BD')}</td></tr></tfoot></table></div>`;
    downloadHtmlFile('all-members-all-years.html',reportShell('সকল বছরের সকল সদস্যদের হিসাব','সকল বছরের বিস্তারিত হিসাব',body,true));return;
  }
  let rows='';
  members.forEach((m,i)=>{rows+=`<tr><td>${Number(m.serial_no||i+1).toLocaleString('bn-BD')}</td><td class="name">${esc(m.name)}</td>`+months.map((_,mi)=>`<td>${paidCell(m,y,mi+1)}</td>`).join('')+`<td>${Number(memberPaid(m,y)).toLocaleString('bn-BD')}</td><td>${Number(memberDue(m,y)).toLocaleString('bn-BD')}</td></tr>`});
  const monthTotals=months.map((_,mi)=>{const x=payments.filter(p=>isCountablePayment(p)&&Number(normalizeYear(p.year))===Number(normalizeYear(y))&&Number(p.month)===mi+1).reduce((s,p)=>s+Number(p.paid_amount||0),0);return `<td>${x>0?Number(x).toLocaleString('bn-BD'):''}</td>`}).join('');
  const widths=reportColumnWidths('months');
  const body=`<div class="table-wrap"><table class="all-members-report-table yearly-report-table"><colgroup><col class="col-serial" style="width:${widths.serialWidth}%"><col class="col-name" style="width:${widths.nameWidth}%">${months.map(()=>`<col class="col-month" style="width:${widths.monthWidth}%">`).join('')}<col class="col-total" style="width:${widths.totalWidth}%"><col class="col-due" style="width:${widths.totalWidth}%"></colgroup><thead class="report-table-head"><tr><th>ক্রমিক</th><th class="name">সদস্যের নাম</th>${months.map(m=>`<th>${m}</th>`).join('')}<th>মোট পরিশোধ</th><th>মোট বাকি</th></tr></thead><tbody>${rows}</tbody><tfoot><tr class="total-row"><td colspan="2">সর্বমোট</td>${monthTotals}<td>${Number(totalPaid(y)).toLocaleString('bn-BD')}</td><td>${Number(totalDue(y)).toLocaleString('bn-BD')}</td></tr></tfoot></table></div>`;
  downloadHtmlFile(`all-members-${y}.html`,reportShell(`${y} সালের সকল সদস্যদের হিসাব`,'প্রতি মাসে শুধু পরিশোধের পরিমাণ দেখানো হয়েছে',body,true));
}
function csvDownload(name,rows){const csv='\ufeff'+rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function downloadAllMembersCSV(){const y=q('allMembersYear').value||'all';const rows=[['ক্রমিক','সদস্যের নাম',...(y==='all'?years:months),'মোট পরিশোধ','মোট বাকি']];members.forEach((m,i)=>rows.push([m.serial_no||i+1,m.name,...(y==='all'?years.map(v=>memberPaid(m,v)):months.map((_,mi)=>payments.filter(p=>isCountablePayment(p)&&String(p.member_id)===String(m.id)&&Number(normalizeYear(p.year))===Number(normalizeYear(y))&&Number(p.month)===mi+1).reduce((s,p)=>s+Number(p.paid_amount||0),0))),memberPaid(m,y),memberDue(m,y)]));csvDownload(`members-${y}.csv`,rows)}
function downloadAssetsCSV(){csvDownload('fund-assets.csv',[['বছর','খাত','বিস্তারিত','পরিমাণ','তারিখ'],...assets.map(a=>[a.year,a.category,a.description,a.amount,a.date])])}

document.addEventListener('DOMContentLoaded',()=>{
  q('footerYear').textContent=new Date().getFullYear();
  q('menuBtn').addEventListener('click',()=>setMenu(true));q('menuClose').addEventListener('click',()=>setMenu(false));q('menuOverlay').addEventListener('click',()=>setMenu(false));document.querySelectorAll('#mobileMenu a').forEach(a=>a.addEventListener('click',()=>setMenu(false)));window.addEventListener('hashchange',route);
  q('personalForm').addEventListener('submit',e=>{e.preventDefault();renderPersonal()});q('membersForm').addEventListener('submit',e=>{e.preventDefault();renderAllMembers()});q('paymentManageYear').addEventListener('change',()=>renderAdminData());q('paymentManageMonth').addEventListener('change',()=>renderAdminData());q('paymentManageMember').addEventListener('change',()=>renderAdminData());
  q('loginBtn').addEventListener('click',login);q('logoutBtn').addEventListener('click',logout);
  q('addOpen').addEventListener('click',()=>{const value=q('addSelect').value;if(!value){showMessage('আগে একটি যুক্ত করার বিষয় নির্বাচন করুন।',false);return}openForm(value);q('addArea').scrollIntoView({behavior:'smooth',block:'start'})});
  q('manageOpen').addEventListener('click',()=>{const value=q('manageSelect').value;if(!value){showMessage('আগে একটি সম্পাদনার বিষয় নির্বাচন করুন।',false);return}openManagement(value);q('managementArea').scrollIntoView({behavior:'smooth',block:'start'})});
  q('memberForm').addEventListener('submit',e=>{e.preventDefault();saveMember()});q('paymentForm').addEventListener('submit',e=>{e.preventDefault();savePayment()});q('profitForm').addEventListener('submit',e=>{e.preventDefault();saveProfit()});q('expenseForm').addEventListener('submit',e=>{e.preventDefault();saveExpense()});q('assetForm').addEventListener('submit',e=>{e.preventDefault();saveAsset()});q('noticeForm').addEventListener('submit',e=>{e.preventDefault();saveNotice()});
  route();load();
});
