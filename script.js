const sb=(window.supabase&&window.SUPABASE_URL&&window.SUPABASE_ANON_KEY)
  ?window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY):null;

const months=['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
const money=n=>`৳ ${Number(n||0).toLocaleString('bn-BD')}`;
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const q=id=>document.getElementById(id);
let members=[],payments=[],profits=[],expenses=[],assets=[],notices=[],adminUser=null,years=[];
// বার্ষিক হিসাবের মূল নিয়ম: প্রতি সদস্যের জন্য বছরে ১২ মাস × ৳৫০০ = ৳৬,০০০।
// বকেয়া সবসময় বার্ষিক মোট পাওনা থেকে প্রকৃত পরিশোধ বাদ দিয়ে অটোমেটিক গণনা হবে।
const MONTHLY_REQUIRED=500;
const MONTHS_PER_YEAR=12;
const YEARLY_REQUIRED=MONTHLY_REQUIRED*MONTHS_PER_YEAR;

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
  if(q('paymentManageMonth')) q('paymentManageMonth').value='all';
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
  return selectedYears(year).length * YEARLY_REQUIRED;
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
function totalRequired(year){return members.length*selectedYears(year).length*YEARLY_REQUIRED}
function totalDue(year){return Math.max(totalRequired(year)-totalPaid(year),0)}
function totalExpense(year){return expenses.filter(e=>!year||year==='all'||Number(normalizeYear(e.year))===Number(normalizeYear(year))).reduce((s,e)=>s+Number(e.amount||0),0)}
function totalProfit(year){return profits.filter(p=>!year||year==='all'||Number(normalizeYear(p.year))===Number(normalizeYear(year))).reduce((s,p)=>s+Number(p.total_profit||0),0)}
function totalAssets(year){return assets.filter(a=>!year||year==='all'||Number(normalizeYear(a.year))===Number(normalizeYear(year))).reduce((s,a)=>s+Number(a.amount||0),0)}
function currentFund(){return totalPaid('all')+totalProfit('all')-totalExpense('all')-totalAssets('all')}
function printButton(id){return `<div class="result-print"><button class="print-btn" type="button" onclick="printSection('${id}')">🖨 প্রিন্ট / PDF</button></div>`}

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
  fillYearSelectors();fillMemberSelectors();
  renderTotal();renderPersonalTotal();renderProfitExpenseDetails();renderFund();renderNotices();renderAllMembersPreview();
  await checkAdmin();
}

function renderPersonalTotal(){
  const deposit=totalPaid('all'),profit=totalProfit('all'),expense=totalExpense('all'),remaining=currentFund();
  q('personalTotalResult').innerHTML=`<div class="report-title"><h3>সংস্থার মোট হিসাব</h3><p>প্রতিষ্ঠার শুরু থেকে সকল বছরের সমন্বিত হিসাব</p></div>
  `;
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
  q('personalResult').innerHTML=`<div class="report-title"><h3>${esc(m.name)}</h3><p>${label}</p></div>
    <div class="member-summary compact-summary">
      <div>মোট পরিশোধ<strong>${money(memberPaid(m,y))}</strong></div>
      <div>মোট বাকি<strong>${money(memberDue(m,y))}</strong></div>
    </div>
    <div class="print-only personal-print-details"><h4>মাসভিত্তিক বিস্তারিত হিসাব</h4><div class="table-wrap"><table><thead><tr><th>সাল</th><th>মাস</th><th>পরিশোধ</th><th>বাকি</th></tr></thead><tbody>${detailRows}</tbody></table></div></div>
    ${printButton('personalResult')}`;
  q('personalResult').scrollIntoView({behavior:'smooth',block:'start'});
}

function memberMonthPaid(m,y,month){
  return payments.filter(p=>isCountablePayment(p)&&String(p.member_id)===String(m.id)&&Number(normalizeYear(p.year))===Number(normalizeYear(y))&&Number(p.month)===month).reduce((s,p)=>s+Number(p.paid_amount||0),0);
}
function paidCell(m,y,month){
  const amount=memberMonthPaid(m,y,month);
  return amount>0?money(amount):'';
}
function renderAllMembers(){
  const y=q('allMembersYear').value||'all';
  if(!y){q('allMembersResult').innerHTML='<div class="empty-state">একটি বছর নির্বাচন করে হিসাব দেখুন।</div>';return;}
  if(y==='all'){
    let h=`<div class="report-title"><h3>সকল বছরের সকল সদস্যদের হিসাব</h3><p>যে মাসে টাকা দেওয়া হয়েছে শুধু সেই টাকাই দেখানো হয়েছে</p></div><div class="table-wrap"><table class="member-report-table"><thead><tr><th>ক্রমিক</th><th class="name nowrap">সদস্যের নাম</th>${years.map(v=>`<th>${esc(v)}</th>`).join('')}<th>মোট পরিশোধ</th><th>মোট বাকি</th></tr></thead><tbody>`;
    members.forEach((m,i)=>{h+=`<tr><td>${Number(m.serial_no||i+1).toLocaleString('bn-BD')}</td><td class="name nowrap">${esc(m.name)}</td>`+years.map(v=>`<td>${memberPaid(m,v)>0?money(memberPaid(m,v)):''}</td>`).join('')+`<td>${money(memberPaid(m,'all'))}</td><td>${money(memberDue(m,'all'))}</td></tr>`});
    h+=`</tbody><tfoot><tr class="total-row"><td colspan="2">সর্বমোট</td>${years.map(v=>`<td>${totalPaid(v)>0?money(totalPaid(v)):''}</td>`).join('')}<td>${money(totalPaid('all'))}</td><td>${money(totalDue('all'))}</td></tr></tfoot></table></div>${printButton('allMembersResult')}`;
    q('allMembersResult').innerHTML=h;return;
  }
  let h=`<div class="report-title"><h3>${esc(y)} সালের সকল সদস্যদের হিসাব</h3><p>প্রতি মাসে শুধু পরিশোধের পরিমাণ দেখানো হয়েছে</p></div><div class="table-wrap"><table class="member-report-table"><thead><tr><th>ক্রমিক</th><th class="name nowrap">সদস্যের নাম</th>${months.map(m=>`<th>${m}</th>`).join('')}<th>মোট পরিশোধ</th><th>মোট বাকি</th></tr></thead><tbody>`;
  members.forEach((m,i)=>{h+=`<tr><td>${Number(m.serial_no||i+1).toLocaleString('bn-BD')}</td><td class="name nowrap">${esc(m.name)}</td>`+months.map((_,mi)=>`<td>${paidCell(m,y,mi+1)}</td>`).join('')+`<td>${money(memberPaid(m,y))}</td><td>${money(memberDue(m,y))}</td></tr>`});
  h+=`</tbody><tfoot><tr class="total-row"><td colspan="2">সর্বমোট</td>${months.map((_,mi)=>{const x=payments.filter(p=>isCountablePayment(p)&&Number(normalizeYear(p.year))===Number(normalizeYear(y))&&Number(p.month)===mi+1).reduce((s,p)=>s+Number(p.paid_amount||0),0);return `<td>${x>0?money(x):''}</td>`}).join('')}<td>${money(totalPaid(y))}</td><td>${money(totalDue(y))}</td></tr></tfoot></table></div>
  <div class="member-summary"><div>মোট পরিশোধ<strong>${money(totalPaid(y))}</strong></div><div>মোট বাকি<strong>${money(totalDue(y))}</strong></div></div>${printButton('allMembersResult')}`;
  q('allMembersResult').innerHTML=h;
}
function renderAllMembersPreview(){
  const rows=years.map(y=>`<tr><td>${esc(y)}</td><td>${money(totalPaid(y))}</td><td>${money(totalDue(y))}</td></tr>`).join('');
  q('allMembersResult').innerHTML=`<div class="report-title"><h3>সকল সদস্যদের হিসাব</h3><p>সাল নির্বাচন করে বিস্তারিত হিসাব দেখুন</p></div><div class="table-wrap"><table><thead><tr><th>সাল</th><th>মোট পরিশোধ</th><th>মোট বাকি</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderTotal(){
  const deposit=totalPaid('all'),profit=totalProfit('all'),expense=totalExpense('all'),remaining=currentFund();
  q('totalResult').innerHTML=`<div class="report-title"><h3>সংস্থার মোট হিসাব</h3><p>প্রতিষ্ঠার শুরু থেকে সকল বছরের সমন্বিত হিসাব</p></div>
  ${printButton('totalResult')}`;
}
function renderProfitExpenseDetails(){
  const profitTotal=totalProfit('all'),expenseTotal=totalExpense('all');
  const profitRows=profits.slice().sort((a,b)=>Number(a.year)-Number(b.year)).map((x,i)=>`<tr><td>${(i+1).toLocaleString('bn-BD')}</td><td>${esc(x.year)}</td><td class="detail-text">${esc(x.description||'-')}</td><td>${money(x.total_profit)}</td></tr>`).join('');
  const expenseRows=expenses.slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))).map((x,i)=>`<tr><td>${(i+1).toLocaleString('bn-BD')}</td><td>${esc(x.year)}</td><td>${esc(x.date||'-')}</td><td class="detail-text">${esc(x.description||'-')}</td><td>${money(x.amount)}</td></tr>`).join('');
  q('profitExpenseDetailsResult').innerHTML=`
    <div class="detail-block profit-detail"><div class="detail-heading"><span>📈</span><h3>লভ্যাংশের বিস্তারিত বিবরণ</h3></div></div>
    <div class="detail-block expense-detail"><div class="detail-heading"><span>🧾</span><h3>খরচের বিস্তারিত বিবরণ</h3></div><div class="table-wrap"><table class="detail-table"><thead><tr><th>ক্রমিক</th><th>সাল</th><th>তারিখ</th><th class="detail-text">বিবরণ</th><th>পরিমাণ</th></tr></thead><tbody>${expenseRows||'<tr><td colspan="5">কোনো খরচের তথ্য নেই।</td></tr>'}</tbody><tfoot><tr class="total-row"><td colspan="4">মোট খরচ</td><td>${money(expenseTotal)}</td></tr></tfoot></table></div></div>
    ${printButton('profitExpenseDetailsResult')}`;
}
function renderFund(){
  const deposit=totalPaid('all'),profit=totalProfit('all'),expense=totalExpense('all'),allocated=totalAssets('all'),remaining=currentFund();
  const body=assets.map((a,i)=>`<tr><td>${(i+1).toLocaleString('bn-BD')}</td><td>${esc(a.year)}</td><td>${esc(a.category)}</td><td class="detail-text">${esc(a.description)}</td><td>${money(a.amount)}</td><td>${esc(a.date||'')}</td></tr>`).join('');
  q('fundResult').innerHTML=`<div class="report-title"><h3>তহবিল ব্যবহারের খাতসমূহ</h3><p>যে সকল খাতে তহবিল ব্যবহার করা হয়েছে</p></div>
  <div class="detail-block fund-detail"><div class="detail-heading"><span>🏦</span><h3>তহবিল ব্যবহারের খাতসমূহ</h3></div><div class="table-wrap"><table class="detail-table"><thead><tr><th>ক্রমিক</th><th>সাল</th><th>খাত</th><th class="detail-text">বিস্তারিত</th><th>পরিমাণ</th><th>তারিখ</th></tr></thead><tbody>${body||'<tr><td colspan="6">এখনও কোনো খাত যোগ করা হয়নি।</td></tr>'}</tbody><tfoot><tr class="total-row"><td colspan="4">বিভিন্ন খাতে ব্যবহার করা মোট</td><td>${money(allocated)}</td><td></td></tr></tfoot></table></div></div>
  <div class="detail-block fund-summary-detail"><div class="detail-heading"><span>💰</span><h3>তহবিলের সংক্ষিপ্ত হিসাব<div class="fund-summary-requested" style="text-align:left">
<div class="fund-summary-row"><span>মোট অবশিষ্ট তহবিল</span><strong id="totalRemainingFund">৳ ০</strong></div>
<div class="fund-summary-row"><span>বিভিন্ন খাতে ব্যবহার</span><strong id="fundUsedVarious">৳ ০</strong></div>
<div class="fund-summary-row"><span>বর্তমান অবশিষ্ট তহবিল</span><strong id="currentRemainingFund">৳ ০</strong></div>
</div></h3></div></div>${printButton('fundResult')}`;
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
  const existing=await sb.from('payments').select('month,paid_amount').eq('member_id',d.member_id).eq('year',year).in('month',monthList);
  if(existing.error){showMessage(existing.error.message,false);return}
  const paidExisting=(existing.data||[]).filter(x=>Number(x.paid_amount||0)>0);
  if(paidExisting.length){
    const names=paidExisting.map(x=>months[Number(x.month)-1]).join(', ');
    showMessage(`এই সদস্যের ${year} সালের ${names} মাসের জমা আগে থেকেই আছে। কোনো তথ্য পরিবর্তন করা হয়নি।`,false);return;
  }
  const totalCents=Math.round(totalAmount*100),baseCents=Math.floor(totalCents/monthCount),remainder=totalCents-baseCents*monthCount;
  const rows=monthList.map((month,i)=>({member_id:d.member_id,year,month,required_amount:MONTHLY_REQUIRED,paid_amount:(baseCents+(i===monthCount-1?remainder:0))/100,payment_date:null}));
  const res=await sb.from('payments').insert(rows);
  if(res.error){showMessage(res.error.message,false);return}
  showMessage(`${monthCount} মাসের জমা একসাথে সংরক্ষণ হয়েছে ✓`,true);resetForm('paymentForm');await load();
}
async function saveProfit(){const d=Object.fromEntries(new FormData(q('profitForm')).entries());const row={year:+d.year,description:d.description.trim(),total_profit:+d.total_profit};const res=d.id?await sb.from('profits').update(row).eq('id',d.id):await sb.from('profits').upsert(row,{onConflict:'year'});if(res.error){showMessage(res.error.message,false);return}showMessage('লভ্যাংশ সংরক্ষণ হয়েছে ✓',true);resetForm('profitForm');await load()}
async function saveExpense(){await saveOrUpdate('expenses',q('expenseForm'),d=>({year:+d.year,date:d.date,description:d.description.trim(),amount:+d.amount}))}
async function saveAsset(){await saveOrUpdate('assets',q('assetForm'),d=>({year:+d.year,date:d.date,category:d.category.trim(),description:d.description.trim(),amount:+d.amount,status:'active'}))}
async function saveNotice(){await saveOrUpdate('notices',q('noticeForm'),d=>({title:d.title.trim(),description:d.description.trim(),status:'published'}))}
async function del(table,id){if(!confirm('এই তথ্যটি মুছে ফেলতে চান?'))return;const {error}=await sb.from(table).delete().eq('id',id);if(error){showMessage(error.message,false);return}showMessage('তথ্য মুছে ফেলা হয়েছে ✓',true);await load()}
function editMember(id){const m=members.find(x=>String(x.id)===String(id));if(!m)return;const f=q('memberForm');f.id.value=m.id;f.name.value=m.name;f.address.value=m.address||'';f.mobile.value=m.mobile||'';openForm('member');f.scrollIntoView({behavior:'smooth',block:'start'})}
function editPayment(id){const p=payments.find(x=>String(x.id)===String(id));if(!p)return;const f=q('paymentForm');f.id.value=p.id;f.member_id.value=p.member_id;f.year.value=p.year;f.month.value=p.month;if(f.month_count)f.month_count.value=1;f.paid_amount.value=p.paid_amount;openForm('payment');f.scrollIntoView({behavior:'smooth',block:'start'})}
function editProfit(id){const x=profits.find(x=>String(x.id)===String(id));if(!x)return;const f=q('profitForm');f.id.value=x.id;f.year.value=x.year;f.description.value=x.description||'';f.total_profit.value=x.total_profit;openForm('profit');f.scrollIntoView({behavior:'smooth',block:'start'})}
function editExpense(id){const x=expenses.find(x=>String(x.id)===String(id));if(!x)return;const f=q('expenseForm');f.id.value=x.id;f.year.value=x.year;f.date.value=x.date;f.description.value=x.description;f.amount.value=x.amount;openForm('expense');f.scrollIntoView({behavior:'smooth',block:'start'})}
function editAsset(id){const x=assets.find(x=>String(x.id)===String(id));if(!x)return;const f=q('assetForm');f.id.value=x.id;f.year.value=x.year;f.date.value=x.date;f.category.value=x.category;f.description.value=x.description;f.amount.value=x.amount;openForm('asset');f.scrollIntoView({behavior:'smooth',block:'start'})}
function editNotice(id){const x=notices.find(x=>String(x.id)===String(id));if(!x)return;const f=q('noticeForm');f.id.value=x.id;f.title.value=x.title;f.description.value=x.description;openForm('notice');f.scrollIntoView({behavior:'smooth',block:'start'})}
function renderAdminData(){
  const orderedMembers=members.slice().sort(memberSort);
  q('adminMembers').innerHTML=`<table><thead><tr><th>ক্রম</th><th class="name">নাম</th><th>মোবাইল</th><th>অ্যাকশন</th></tr></thead><tbody>`+orderedMembers.map((m,i)=>`<tr><td>${Number(m.serial_no||i+1).toLocaleString('bn-BD')}</td><td class="name">${esc(m.name)}</td><td>${esc(m.mobile||'-')}</td><td class="row-actions"><button class="small-btn edit" onclick="editMember('${esc(m.id)}')">Edit</button><button class="small-btn del" onclick="del('members','${esc(m.id)}')">Delete</button></td></tr>`).join('')+`</tbody></table>`;
  const selectedYear=q('paymentManageYear').value||'all';
  const selectedMonth=q('paymentManageMonth')?.value||'all';
  const search=(q('paymentManageSearch')?.value||'').trim().toLowerCase();
  const paymentRows=payments.filter(p=>{
    // ০ টাকার placeholder record database-এ থাকবে, কিন্তু Excel-এর প্রকৃত জমার
    // তালিকার সঙ্গে মিল রেখে Admin management-এ শুধু বাস্তব জমা দেখানো হবে।
    if(Number(p.paid_amount||0)<=0)return false;
    if(selectedYear!=='all' && String(p.year)!==String(selectedYear))return false;
    if(selectedMonth!=='all' && Number(p.month)!==Number(selectedMonth))return false;
    if(!search)return true;
    const m=members.find(x=>String(x.id)===String(p.member_id));
    const serial=String(m?.serial_no??'');
    const name=String(m?.name??'').toLowerCase();
    const mobile=String(m?.mobile??'').toLowerCase();
    return serial.includes(search)||name.includes(search)||mobile.includes(search);
  }).slice().sort((a,b)=>{
    const ma=members.find(m=>String(m.id)===String(a.member_id))||{};
    const mb=members.find(m=>String(m.id)===String(b.member_id))||{};
    return memberSort(ma,mb)||Number(a.year)-Number(b.year)||Number(a.month)-Number(b.month);
  });
  q('adminPayments').innerHTML=`<table><thead><tr><th>ক্রম</th><th class="name">সদস্য</th><th>সাল</th><th>মাস</th><th>জমা</th><th>অ্যাকশন</th></tr></thead><tbody>`+paymentRows.map((p,i)=>{const m=members.find(x=>String(x.id)===String(p.member_id))||{};return `<tr><td>${Number(m.serial_no||i+1).toLocaleString('bn-BD')}</td><td class="name">${esc(m.name||'')}</td><td>${esc(p.year)}</td><td>${months[Number(p.month)-1]||''}</td><td>${money(p.paid_amount)}</td><td class="row-actions"><button class="small-btn edit" onclick="editPayment('${esc(p.id)}')">Edit</button><button class="small-btn del" onclick="del('payments','${esc(p.id)}')">Delete</button></td></tr>`}).join('')+`</tbody></table>`;
  q('adminProfits').innerHTML=`<table><thead></thead><tbody>`+profits.map(x=>`<tr><td>${esc(x.year)}</td><td class="name">${esc(x.description||'')}</td><td>${money(x.total_profit)}</td><td class="row-actions"><button class="small-btn edit" onclick="editProfit('${esc(x.id)}')">Edit</button><button class="small-btn del" onclick="del('profits','${esc(x.id)}')">Delete</button></td></tr>`).join('')+`</tbody></table>`;
  q('adminExpenses').innerHTML=`<table><thead><tr><th>বছর</th><th>তারিখ</th><th class="name">বিবরণ</th><th>পরিমাণ</th><th>অ্যাকশন</th></tr></thead><tbody>`+expenses.map(x=>`<tr><td>${esc(x.year)}</td><td>${esc(x.date||'')}</td><td class="name">${esc(x.description)}</td><td>${money(x.amount)}</td><td class="row-actions"><button class="small-btn edit" onclick="editExpense('${esc(x.id)}')">Edit</button><button class="small-btn del" onclick="del('expenses','${esc(x.id)}')">Delete</button></td></tr>`).join('')+`</tbody></table>`;
  q('adminAssets').innerHTML=`<table><thead><tr><th>বছর</th><th>খাত</th><th class="name">বিবরণ</th><th>পরিমাণ</th><th>অ্যাকশন</th></tr></thead><tbody>`+assets.map(x=>`<tr><td>${esc(x.year)}</td><td>${esc(x.category)}</td><td class="name">${esc(x.description)}</td><td>${money(x.amount)}</td><td class="row-actions"><button class="small-btn edit" onclick="editAsset('${esc(x.id)}')">Edit</button><button class="small-btn del" onclick="del('assets','${esc(x.id)}')">Delete</button></td></tr>`).join('')+`</tbody></table>`;
  q('adminNotices').innerHTML=`<table><thead><tr><th>শিরোনাম</th><th class="name">বিবরণ</th><th>তারিখ</th><th>অ্যাকশন</th></tr></thead><tbody>`+notices.map(x=>`<tr><td>${esc(x.title)}</td><td class="name">${esc(x.description)}</td><td>${esc(x.publish_date||'')}</td><td class="row-actions"><button class="small-btn edit" onclick="editNotice('${esc(x.id)}')">Edit</button><button class="small-btn del" onclick="del('notices','${esc(x.id)}')">Delete</button></td></tr>`).join('')+`</tbody></table>`;
}
async function checkAdmin(){if(!sb)return;const {data:{session}}=await sb.auth.getSession();adminUser=session?.user||null;if(!adminUser){q('loginBox').hidden=false;q('adminBox').hidden=true;return}const {data,error}=await sb.from('admin_users').select('user_id').eq('user_id',adminUser.id).maybeSingle();if(error||!data){q('loginBox').hidden=false;q('adminBox').hidden=true;q('loginMsg').textContent='এই অ্যাকাউন্টে অ্যাডমিন অনুমতি নেই।';return}q('loginBox').hidden=true;q('adminBox').hidden=false;q('adminUser').textContent=adminUser.email||'Admin';renderAdminData()}
async function login(){if(!sb){showMessage('Supabase configuration পাওয়া যায়নি।',false,'loginMsg');return}showMessage('লগইন হচ্ছে...',true,'loginMsg');const {error}=await sb.auth.signInWithPassword({email:q('adminEmail').value.trim(),password:q('adminPassword').value});if(error){showMessage(error.message,false,'loginMsg');return}await checkAdmin();q('adminPassword').value=''}
async function logout(){await sb.auth.signOut();location.hash='admin';location.reload()}
function openForm(name){document.querySelectorAll('.admin-form').forEach(f=>f.classList.remove('active'));const f=q(name+'Form');if(f)f.classList.add('active')}
function openManagement(name){document.querySelectorAll('.admin-data').forEach(x=>x.classList.remove('active'));q('managementArea').style.display='block';const target=q('manage'+name.charAt(0).toUpperCase()+name.slice(1));if(target)target.classList.add('active');if(name==='payments')renderAdminData()}
function setMenu(open){const menu=q('mobileMenu'),overlay=q('menuOverlay'),btn=q('menuBtn');menu.classList.toggle('open',open);overlay.classList.toggle('show',open);btn.setAttribute('aria-expanded',String(open));document.body.classList.toggle('menu-open',open)}
function openMainMenu(){setMenu(true)}
function route(){const id=(location.hash||'#personal').slice(1);const valid=['personal','members','due','profitExpenseDetails','fund','notices','admin'];const active=valid.includes(id)?id:'personal';document.querySelectorAll('.page-section').forEach(s=>s.classList.toggle('active',s.id===active));document.querySelectorAll('#mobileMenu a[data-view]').forEach(a=>a.classList.toggle('active',a.dataset.view===active));setMenu(false)}
function printSection(id){
  const target=q(id);if(!target)return;

  // PDF/Print-এর জন্য একই রিপোর্টের একটি আলাদা, self-contained print page তৈরি করা হচ্ছে।
  // style.css আলাদাভাবে load না করে inline করা হয়, যাতে Android/Chrome-এর print preview
  // page-load timing-এর কারণে "There was a problem printing the page" না আসে।
  const clone=target.cloneNode(true);
  clone.querySelectorAll('.result-print').forEach(x=>x.remove());
  clone.querySelectorAll('.print-header-generated').forEach(x=>x.remove());
  if(id==='personalResult'){
    const summary=clone.querySelector('.compact-summary');
    const details=clone.querySelector('.personal-print-details');
    if(summary&&details)details.after(summary);
  }
  const header=document.createElement('div');
  header.className='print-header-generated';
  header.innerHTML='<h1>আল ইখওয়ান ইসলামী সংস্থা বাংলাদেশ</h1><p>বানিপুর, কেন্দুয়া, নেত্রকোনা, মোমেনশাহী, ঢাকা</p>';
  clone.prepend(header);
  clone.classList.add('print-target');

  const printWindow=window.open('','_blank','width=900,height=700');
  if(!printWindow){showMessage('প্রিন্ট পেজ খোলা যায়নি। ব্রাউজারের pop-up অনুমতি দিন।',false);return}

  const styleUrl=new URL('style.css',window.location.href).href;
  const basePrintCss=`
    body{margin:0;background:#fff!important;font-family:inherit}
    .print-page{width:100%;box-sizing:border-box;padding:10px}
    .print-page .print-target{display:block!important;width:100%!important;margin:0!important;padding:0!important;background:#fff!important;box-shadow:none!important;border:0!important}
    .print-page .print-header-generated{display:block!important;text-align:center!important;margin:0 0 14px!important;padding:0!important}
    .print-page .print-header-generated h1{display:block!important;margin:0 0 4px!important;font-size:24px!important;line-height:1.3!important;font-weight:800!important;text-align:center!important}
    .print-page .print-header-generated p{display:block!important;margin:0 0 12px!important;font-size:12px!important;line-height:1.4!important;font-weight:500!important;text-align:center!important}
    .print-page .result-print{display:none!important}
    .print-page .print-only{display:block!important}
    .print-page .table-wrap{overflow:visible!important}
    .print-page table{width:100%!important}
    @media print{
      @page{margin:10mm}
      body{margin:0!important}
      .print-page{padding:0!important}
      .print-page .print-target{display:block!important}
      .print-page .print-only{display:block!important;visibility:visible!important}
      .print-page .print-only *{visibility:visible!important}
      .print-page .result-print{display:none!important}
      .print-page .report-title:before,.print-page .report-title:after{content:none!important}
      .print-page .report-title{margin:0 0 14px!important;text-align:center!important}
      .print-page .report-title h3{margin:0 0 5px!important;font-size:21px!important;line-height:1.35!important}
      .print-page .report-title p{margin:0!important;font-size:12px!important;line-height:1.4!important}
      .print-page .personal-print-details{margin-top:14px!important}
      .print-page .personal-print-details h4{margin:0 0 8px!important;font-size:15px!important;text-align:left!important}
      .print-page table{font-size:10px!important}
      .print-page th,.print-page td{padding:6px!important}
    }`;

  const buildPrintPage=css=>{
    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>প্রতিবেদন</title><style>${css.replace(/<\/style/gi,'<\\/style')}</style></head><body><div class="print-page"></div></body></html>`);
    printWindow.document.close();
    const page=printWindow.document.querySelector('.print-page');
    if(!page){try{printWindow.close()}catch(e){}showMessage('প্রিন্ট পেজ তৈরি করা যায়নি।',false);return}
    page.appendChild(clone);
    const doPrint=()=>{
      try{printWindow.focus();printWindow.print();}
      catch(e){showMessage('PDF/Print চালু করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।',false)}
    };
    const fontsReady=printWindow.document.fonts&&printWindow.document.fonts.ready
      ?printWindow.document.fonts.ready:Promise.resolve();
    fontsReady.then(()=>setTimeout(doPrint,300));
    printWindow.onafterprint=()=>setTimeout(()=>{try{printWindow.close()}catch(e){}},300);
  };

  // আগে CSS inline করার চেষ্টা; fetch ব্যর্থ হলে embedded print CSS দিয়েও রিপোর্টটি print হবে।
  fetch(styleUrl,{cache:'no-store'}).then(r=>{
    if(!r.ok)throw new Error('style load failed');
    return r.text();
  }).then(css=>buildPrintPage(css+'\n'+basePrintCss)).catch(()=>buildPrintPage(basePrintCss));
}

function csvDownload(name,rows){const csv='\ufeff'+rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function downloadAllMembersCSV(){const y=q('allMembersYear').value||'all';const rows=[['ক্রমিক','সদস্যের নাম',...(y==='all'?years:months),'মোট পরিশোধ','মোট বাকি']];members.forEach((m,i)=>rows.push([m.serial_no||i+1,m.name,...(y==='all'?years.map(v=>memberPaid(m,v)):months.map((_,mi)=>payments.filter(p=>isCountablePayment(p)&&String(p.member_id)===String(m.id)&&Number(normalizeYear(p.year))===Number(normalizeYear(y))&&Number(p.month)===mi+1).reduce((s,p)=>s+Number(p.paid_amount||0),0))),memberPaid(m,y),memberDue(m,y)]));csvDownload(`members-${y}.csv`,rows)}
function downloadAssetsCSV(){csvDownload('fund-assets.csv',[['বছর','খাত','বিস্তারিত','পরিমাণ','তারিখ'],...assets.map(a=>[a.year,a.category,a.description,a.amount,a.date])])}

document.addEventListener('DOMContentLoaded',()=>{
  q('footerYear').textContent=new Date().getFullYear();
  q('menuBtn').addEventListener('click',()=>setMenu(true));q('menuClose').addEventListener('click',()=>setMenu(false));q('menuOverlay').addEventListener('click',()=>setMenu(false));document.querySelectorAll('#mobileMenu a').forEach(a=>a.addEventListener('click',()=>setMenu(false)));window.addEventListener('hashchange',route);
  q('personalForm').addEventListener('submit',e=>{e.preventDefault();renderPersonal()});q('membersForm').addEventListener('submit',e=>{e.preventDefault();renderAllMembers()});q('paymentManageYear').addEventListener('change',()=>renderAdminData());q('paymentManageMonth').addEventListener('change',()=>renderAdminData());q('paymentManageSearch').addEventListener('input',()=>renderAdminData());
  q('loginBtn').addEventListener('click',login);q('logoutBtn').addEventListener('click',logout);
  q('addOpen').addEventListener('click',()=>{const value=q('addSelect').value;if(!value){showMessage('আগে একটি যুক্ত করার বিষয় নির্বাচন করুন।',false);return}openForm(value);q('addArea').scrollIntoView({behavior:'smooth',block:'start'})});
  q('manageOpen').addEventListener('click',()=>{const value=q('manageSelect').value;if(!value){showMessage('আগে একটি সম্পাদনার বিষয় নির্বাচন করুন।',false);return}openManagement(value);q('managementArea').scrollIntoView({behavior:'smooth',block:'start'})});
  q('memberForm').addEventListener('submit',e=>{e.preventDefault();saveMember()});q('paymentForm').addEventListener('submit',e=>{e.preventDefault();savePayment()});q('profitForm').addEventListener('submit',e=>{e.preventDefault();saveProfit()});q('expenseForm').addEventListener('submit',e=>{e.preventDefault();saveExpense()});q('assetForm').addEventListener('submit',e=>{e.preventDefault();saveAsset()});q('noticeForm').addEventListener('submit',e=>{e.preventDefault();saveNotice()});
  route();load();
});

// Requested fund-summary calculation:
// current remaining = total remaining fund - amount used in various sectors.
function updateRequestedFundSummary(totalDeposit, totalProfit, totalMiscExpense, usedVarious) {
  const totalRemaining = Number(totalDeposit || 0) + Number(totalProfit || 0) - Number(totalMiscExpense || 0);
  const currentRemaining = totalRemaining - Number(usedVarious || 0);
  const fmt = n => `৳ ${Number(n || 0).toLocaleString('bn-BD')}`;
  const a = document.getElementById('totalRemainingFund');
  const b = document.getElementById('fundUsedVarious');
  const c = document.getElementById('currentRemainingFund');
  if (a) a.textContent = fmt(totalRemaining);
  if (b) b.textContent = fmt(usedVarious);
  if (c) c.textContent = fmt(currentRemaining);
}
