(()=>{
"use strict";

const $=s=>document.querySelector(s),
$$=s=>[...document.querySelectorAll(s)],
CFG=window.LATIN_APP_CONFIG||{},
K={
  w:"latinlab_words",
  r:"latinlab_records",
  s:"latinlab_sessions",
  c:"latinlab_config"
},
H=[
  "latin","meaning","pos","genitive","gender","feminine","neuter",
  "present_1sg","perfect_1sg","pluperfect_1sg","future_1sg",
  "infinitive","notes"
],
PL={
  noun:"名词",
  verb:"动词",
  adjective:"形容词",
  adverb:"副词",
  preposition:"介词",
  conjunction:"连词",
  pronoun:"代词",
  other:"其他"
},
MASTER_STREAK=6,
INTERVAL_DAYS=[0,1,3,7,14,30,60];

let words=[],
records={},
sessions=[],
settings={},
sb=null,
user=null,
mode=null,
queue=[],
ix=0,
answers=[],
cur=null,
morph=null,
qtime=0,
start=0,
timer=null,
advanceTimer=null,
result=null,
answered=false;

const id=()=>crypto?.randomUUID
  ?crypto.randomUUID()
  :String(Date.now())+Math.random();

const n=s=>String(s||"")
  .trim()
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"")
  .replace(/[’']/g,"'")
  .replace(/\s+/g," ");

const esc=s=>String(s??"").replace(
  /[&<>"']/g,
  c=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[c])
);

const time=()=>Date.now();

const dur=x=>{
  let s=Math.floor(x/1000);
  return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");
};

const label=m=>({
  meaning:"看词选意",
  spelling:"拼写练习",
  morphology:"变格与变位"
}[m]||m);

const notify=s=>{
  let e=$("#toast");
  e.textContent=s;
  e.classList.remove("hidden");
  setTimeout(()=>e.classList.add("hidden"),2600);
};

const read=(k,d)=>{
  try{
    return JSON.parse(localStorage.getItem(k))??d
  }catch{
    return d
  }
};

const save=()=>{
  localStorage.setItem(K.w,JSON.stringify(words));
  localStorage.setItem(K.r,JSON.stringify(records));
  localStorage.setItem(K.s,JSON.stringify(sessions));
};

const ensureStage=w=>{
  if(!w.stage||!["new","review","mastered"].includes(w.stage))
    w.stage="new";
  return w;
};

const rec=w=>{
  if(!w)return null;

  let r=records[w.id];

  if(!r){
    r={
      wordId:w.id,
      meaning:{
        attempts:0,
        correct:0,
        streak:0,
        next:0,
        avg:null
      },
      spelling:{
        attempts:0,
        correct:0,
        streak:0,
        next:0,
        avg:null
      },
      morphology:{
        attempts:0,
        correct:0,
        streak:0,
        next:0,
        avg:null
      }
    };
  }

  r.meaning=r.meaning||{
    attempts:0,
    correct:0,
    streak:0,
    next:0,
    avg:null
  };

  r.spelling=r.spelling||{
    attempts:0,
    correct:0,
    streak:0,
    next:0,
    avg:null
  };

  records[w.id]=r;
  return r;
};

const due=(w,m)=>{
  let r=rec(w)[m];
  return !r.attempts||!r.next||r.next<=time();
};

const fmt=t=>new Date(t).toLocaleString("zh-CN",{
  month:"2-digit",
  day:"2-digit",
  hour:"2-digit",
  minute:"2-digit"
});

const csvcell=v=>{
  v=String(v??"");
  return /[",\r\n]/.test(v)
    ?'"'+v.replace(/"/g,'""')+'"'
    :v;
};

const download=(name,txt)=>{
  let a=document.createElement("a"),
      u=URL.createObjectURL(
        new Blob(["\uFEFF",txt],{
          type:"text/csv;charset=utf-8"
        })
      );

  a.href=u;
  a.download=name;
  a.click();

  URL.revokeObjectURL(u);
};


/* =========================================================
   学习状态
   ========================================================= */

function mastery(w){
  let r=rec(w);
  return r.meaning.streak>=MASTER_STREAK &&
         r.spelling.streak>=MASTER_STREAK;
}

function refreshStages(){
  let changed=false;

  words.forEach(w=>{
    ensureStage(w);

    if(
      w.stage!=="new" &&
      mastery(w) &&
      w.stage!=="mastered"
    ){
      w.stage="mastered";
      changed=true;
    }
  });

  if(changed)save();
}


/* =========================================================
   页面渲染
   ========================================================= */

function render(){
  refreshStages();

  let recent=sessions
    .flatMap(s=>s.answers||[])
    .slice(-100);

  let checked=recent.filter(
    a=>a.verification!=="暂无法核验"
  );

  let newWords=words.filter(
    w=>w.stage==="new"
  );

  let reviewWords=words.filter(
    w=>w.stage==="review"
  );

  let masteredWords=words.filter(
    w=>w.stage==="mastered"
  );

  let dueMeaning=reviewWords.filter(
    w=>due(w,"meaning")
  ).length;

  let dueSpelling=reviewWords.filter(
    w=>due(w,"spelling")
  ).length;

  $("#wordsN").textContent=words.length;
  $("#dueN").textContent=dueMeaning+dueSpelling;

  $("#studiedN").textContent=
    Object.values(records).filter(
      r=>r.meaning?.attempts||r.spelling?.attempts
    ).length;

  $("#accuracyN").textContent=
    checked.length
      ?Math.round(
        checked.filter(a=>a.correct).length/
        checked.length*100
      )+"%"
      :"—";

  $("#newN").textContent=newWords.length;
  $("#reviewN").textContent=reviewWords.length;
  $("#masteredN").textContent=masteredWords.length;

  $("#newMeaningN").textContent=newWords.length;
  $("#reviewMeaningN").textContent=dueMeaning;
  $("#reviewSpellingN").textContent=dueSpelling;

  $("#masterRule").textContent=
    `看词选意和拼写各连续正确 ${MASTER_STREAK} 次后自动进入已掌握。`;

  let q=n($("#search").value);

  let list=words.filter(
    w=>!q||n(w.latin+" "+w.meaning).includes(q)
  );

  $("#wordRows").innerHTML=list.length
    ?list.map(w=>{
      let r=rec(w);

      let p=
        w.stage==="new"
          ?"新学"
          :w.stage==="review"
            ?`复习 · ${
              due(w,"meaning")||due(w,"spelling")
                ?"待复习"
                :"未到期"
            }`
            :"已掌握";

      return `
        <tr>
          <td>
            ${esc(w.latin)}
            <small>${esc(w.genitive||w.infinitive||"")}</small>
          </td>

          <td>${esc(w.meaning)}</td>

          <td>
            <span class="tag">
              ${esc(PL[w.pos]||w.pos)}
            </span>
          </td>

          <td>
            ${p}
            <small>
              词义 ${r.meaning.streak}/${MASTER_STREAK}
              ·
              拼写 ${r.spelling.streak}/${MASTER_STREAK}
            </small>
          </td>

          <td>
            <button data-del="${esc(w.id)}">删除</button>
          </td>
        </tr>
      `;
    }).join("")
    :'<tr><td colspan="5" class="empty">还没有词条，请导入 CSV。</td></tr>';

  $$("[data-del]").forEach(b=>{
    b.onclick=()=>{
      if(confirm("删除这个词条？")){
        words=words.filter(
          w=>w.id!==b.dataset.del
        );

        delete records[b.dataset.del];

        save();
        render();
        sync();
      }
    };
  });

  $("#sessions").innerHTML=
    sessions.slice(-5).reverse().map(s=>`
      <p>
        ${esc(label(s.mode))}
        · ${(s.answers||[]).length} 题
        · ${fmt(s.endedAt)}
        · ${
          Math.round(
            (s.answers||[]).filter(a=>a.correct).length/
            Math.max(1,(s.answers||[]).length)*100
          )
        }%
        <button data-view="${s.id}">
          查看
        </button>
      </p>
    `).join("")
    ||
    '<p class="muted">完成练习后，这里会显示记录。</p>';

  $$("[data-view]").forEach(b=>{
    b.onclick=()=>{
      showResult(
        sessions.find(
          s=>s.id===b.dataset.view
        )
      );
    };
  });
}


/* =========================================================
   CSV
   ========================================================= */

function parseCSV(t){
  let rows=[],
      r=[],
      c="",
      q=false;

  t=t.replace(/^\uFEFF/,"");

  for(let i=0;i<t.length;i++){
    let x=t[i];

    if(q){
      if(x==='"'&&t[i+1]==='"'){
        c+='"';
        i++;
      }else if(x==='"'){
        q=false;
      }else{
        c+=x;
      }
    }else if(x==='"'){
      q=true;
    }else if(x===","){
      r.push(c);
      c="";
    }else if(x==="\n"){
      r.push(c);
      rows.push(r);
      r=[];
      c="";
    }else if(x!=="\r"){
      c+=x;
    }
  }

  if(c||r.length){
    r.push(c);
    rows.push(r);
  }

  return rows.filter(
    r=>r.some(x=>x.trim())
  );
}

function importCSV(t){
  let rows=parseCSV(t);

  if(rows.length<2)
    throw Error("CSV 没有数据行");

  let heads=rows
    .shift()
    .map(x=>x.trim().toLowerCase());

  if(!["latin","meaning","pos"].every(
    x=>heads.includes(x)
  )){
    throw Error(
      "表头必须包含 latin、meaning、pos；请下载模板"
    );
  }

  let incoming=rows.map((r,i)=>{
    let w={};

    H.forEach(k=>{
      w[k]=(r[heads.indexOf(k)]||"").trim();
    });

    if(
      !w.latin||
      !w.meaning||
      !PL[w.pos]
    ){
      throw Error(
        `第 ${i+2} 行缺少必填字段或词性不正确`
      );
    }

    return {
      ...w,
      stage:"new",
      id:id(),
      createdAt:time(),
      batchDate:new Date()
        .toISOString()
        .slice(0,10)
    };
  });

  let a=0,
      u=0;

  incoming.forEach(w=>{
    let old=words.find(
      x=>n(x.latin)===n(w.latin)&&
         n(x.meaning)===n(w.meaning)
    );

    if(old){
      let oldStage=old.stage||"new";

      Object.assign(
        old,
        w,
        {
          id:old.id,
          stage:oldStage
        }
      );

      u++;
    }else{
      words.push(w);
      a++;
    }
  });

  save();
  render();

  $("#importMsg").textContent=
    `导入完成：新增 ${a} 个，更新 ${u} 个；新增词默认进入“新学”。`;

  sync();
}

function moveAllNewToReview(){
  let a=0;

  words.forEach(w=>{
    if(w.stage==="new"){
      w.stage="review";
      a++;
    }
  });

  if(!a)
    return notify("目前没有新学单词");

  save();
  render();
  sync();

  notify(`已将 ${a} 个新学单词加入复习`);
}

function shuffle(a){
  for(let i=a.length-1;i>0;i--){
    let j=Math.random()*(i+1)|0;
    [a[i],a[j]]=[a[j],a[i]];
  }

  return a;
}


/* =========================================================
   练习
   ========================================================= */

function startQuiz(m){
  if(!words.length)
    return notify("请先导入 CSV 词表");

  mode=m;

  let pool;

  if(m==="new-meaning"){
    pool=words.filter(
      w=>w.stage==="new"
    );
  }else if(m==="review-meaning"){
    pool=words.filter(
      w=>w.stage==="review"&&
         due(w,"meaning")
    );
  }else if(m==="review-spelling"){
    pool=words.filter(
      w=>w.stage==="review"&&
         due(w,"spelling")
    );
  }else{
    return notify("该练习模式已停用");
  }

  if(!pool.length){
    if(m==="new-meaning")
      return notify("新学区域目前没有单词");

    if(m==="review-meaning")
      return notify("目前没有到期的看词选意复习");

    return notify("目前没有到期的拼写复习");
  }

  queue=shuffle(pool).slice(0,15);
  ix=0;
  answers=[];
  start=time();

  $("#quizTitle").textContent=
    m==="new-meaning"
      ?"新学 · 看词选意"
      :m==="review-meaning"
        ?"复习 · 看词选意"
        :"复习 · 拼写练习";

  $("#quizShade").classList.remove("hidden");

  question();
}


/* =========================================================
   出题
   ========================================================= */

function question(){
  if(ix>=queue.length)
    return exitQuiz();

  if(advanceTimer){
    clearTimeout(advanceTimer);
    advanceTimer=null;
  }

  cur=queue[ix];
  answered=false;
  qtime=time();

  $("#counter").textContent=
    `第 ${ix+1} / ${queue.length} 题`;

  $("#bar").style.width=
    (ix/queue.length*100)+"%";

  $("#timer").textContent="00:00";

  let html="";

  if(
    mode==="new-meaning"||
    mode==="review-meaning"
  ){
    let distractors=shuffle(
      words.filter(
        w=>
          w.id!==cur.id&&
          n(w.meaning)!==n(cur.meaning)&&
          n(w.meaning)!==""
      )
    );

    let opts=shuffle([
      cur,
      ...distractors.slice(0,3)
    ]);

    html=`
      <div class="q">
        <p class="muted">选择中文释义</p>

        <div class="word">
          ${esc(cur.latin)}
        </div>

        <p class="hint">
          ${esc(PL[cur.pos])}
        </p>
      </div>

      <div class="answers">
        ${opts.map(w=>`
          <button data-opt="${w.id}">
            ${esc(w.meaning)}
          </button>
        `).join("")}
      </div>

      <div id="feedback"></div>
    `;
  }else{
    morph={
      question:`中文“${cur.meaning}” → 拉丁语原形`,
      label:cur.meaning,
      expected:cur.latin,
      feature:{
        type:"spelling"
      }
    };

    html=`
      <div class="q">
        <p class="muted">
          根据中文输入拉丁语原形
        </p>

        <div class="word">
          ${esc(cur.meaning)}
        </div>

        <p class="hint">
          ${esc(PL[cur.pos])}
        </p>
      </div>

      <input
        id="typed"
        class="answer"
        autocomplete="off"
        spellcheck="false"
        placeholder="输入拉丁语"
      >

      <div id="feedback"></div>

      <p class="right">
        <button id="submit" class="primary">
          提交答案
        </button>
      </p>
    `;
  }

  $("#question").innerHTML=html;

  let slashHost=$("#question .q");

  if(slashHost){
    let sb0=document.createElement("button");

    sb0.id="slash";
    sb0.type="button";
    sb0.className="slash";
    sb0.textContent="斩";
    sb0.title="这个词已经会了，直接移入已掌握";
    sb0.onclick=slashWord;

    slashHost.appendChild(sb0);
  }

  timer&&clearInterval(timer);

  timer=setInterval(()=>{
    $("#timer").textContent=
      dur(time()-qtime);
  },250);

  $$("[data-opt]").forEach(b=>{
    b.onclick=()=>answerMeaning(
      b.dataset.opt,
      b
    );
  });

  if($("#submit")){
    $("#typed").focus();

    $("#typed").onkeydown=e=>{
      if(e.key==="Enter")
        submitTyped();
    };

    $("#submit").onclick=submitTyped;
  }
}


/* =========================================================
   斩：直接移入已掌握
   ========================================================= */

(function(){
  let st=document.createElement("style");

  st.textContent=`
    .q{position:relative}
    .slash{
      position:absolute;
      top:0;
      right:0;
      padding:6px 14px;
      border:1px solid #c0392b;
      border-radius:999px;
      background:#fff;
      color:#c0392b;
      font-size:15px;
      font-weight:600;
      cursor:pointer;
    }
    .slash:hover{
      background:#c0392b;
      color:#fff;
    }
  `;

  document.head.appendChild(st);
})();

function slashWord(){
  if(!cur||!mode)return;

  let w=cur,
      r=rec(w);

  w.stage="mastered";

  r.meaning.next=0;
  r.spelling.next=0;

  if(advanceTimer){
    clearTimeout(advanceTimer);
    advanceTimer=null;
  }

  notify(
    `已斩：${w.latin}，已移入“已掌握”`
  );

  save();
  render();
  sync();

  if(ix>=queue.length-1){
    ix=queue.length;
    exitQuiz();
  }else{
    ix++;
    question();
  }
}


/* =========================================================
   自动进入下一题
   ========================================================= */

function autoNext(delay){
  if(advanceTimer)
    clearTimeout(advanceTimer);

  advanceTimer=setTimeout(()=>{
    advanceTimer=null;

    if(ix>=queue.length-1){
      ix=queue.length;
      exitQuiz();
    }else{
      ix++;
      question();
    }
  },delay);
}


/* =========================================================
   看词选意
   ========================================================= */

function answerMeaning(id0,button){
  if(answered)return;

  let elapsed=time()-qtime,
      correct=id0===cur.id,
      chosen=words.find(
        w=>w.id===id0
      );

  answered=true;

  $$("[data-opt]").forEach(b=>{
    b.disabled=true;

    if(b.dataset.opt===cur.id)
      b.classList.add("correct");

    if(b===button&&!correct)
      b.classList.add("wrong");
  });

  let a=makeAnswer(
    cur,
    cur.meaning,
    correct,
    elapsed,
    {
      question:`${cur.latin} → 中文释义`,
      userAnswer:chosen?.meaning||"",
      feature:{
        type:"meaning"
      }
    }
  );

  addAnswer(a);

  $("#feedback").innerHTML=`
    <div class="feedback ${correct?"good":"bad"}">
      <b>
        ${correct?"回答正确":"回答错误"}
      </b>
      <br>
      正确答案：${esc(cur.meaning)}
      <br>
      用时 ${(elapsed/1000).toFixed(1)} 秒
    </div>
  `;

  $("#bar").style.width=
    ((ix+1)/queue.length*100)+"%";

  /*
   * 答对 0.65 秒后进入下一题
   * 答错 1.5 秒后进入下一题
   */
  autoNext(correct?650:1500);
}


/* =========================================================
   答题记录
   ========================================================= */

function makeAnswer(
  w,
  expected,
  correct,
  elapsed,
  x={}
){
  return {
    id:id(),
    wordId:w.id,
    latin:w.latin,
    meaning:w.meaning,
    pos:w.pos,
    mode,
    question:x.question||"",
    expected:expected||"",
    userAnswer:x.userAnswer||"",
    correct:!!correct,
    elapsed,
    answeredAt:time(),
    feature:x.feature||{},
    verification:x.verification||"本地比对"
  };
}


/* =========================================================
   拼写练习
   ========================================================= */

function submitTyped(){
  if(answered)return;

  let raw=$("#typed").value.trim();

  if(!raw)
    return notify("请先输入答案");

  let elapsed=time()-qtime,
      expected=cur.latin,
      correct=n(raw)===n(expected);

  answered=true;

  let a=makeAnswer(
    cur,
    expected,
    correct,
    elapsed,
    {
      question:morph.question,
      userAnswer:raw,
      feature:morph.feature
    }
  );

  addAnswer(a);

  $("#feedback").innerHTML=`
    <div class="feedback ${correct?"good":"bad"}">
      <b>
        ${correct?"回答正确":"回答错误"}
      </b>
      <br>
      参考答案：${esc(expected)}
      <br>
      用时 ${(elapsed/1000).toFixed(1)} 秒
    </div>
  `;

  $("#submit").classList.add("hidden");

  $("#bar").style.width=
    ((ix+1)/queue.length*100)+"%";

  /*
   * 答对 0.65 秒后进入下一题
   * 答错 1.5 秒后进入下一题
   */
  autoNext(correct?650:1500);
}


/* =========================================================
   保存答题结果
   ========================================================= */

function addAnswer(a){
  answers.push(a);

  let w=words.find(
    x=>x.id===a.wordId
  );

  let r=rec(w);

  let key=
    (
      a.mode==="new-meaning"||
      a.mode==="review-meaning"
    )
      ?"meaning"
      :"spelling";

  let m=r[key];

  m.attempts++;

  if(a.correct){
    m.correct++;
    m.streak++;

    let days=
      INTERVAL_DAYS[
        Math.min(
          m.streak,
          INTERVAL_DAYS.length-1
        )
      ];

    let speed=
      a.elapsed<3500
        ?1.15
        :a.elapsed<8000
          ?1
          :.65;

    m.next=
      time()+
      Math.max(
        600000,
        days*86400000*speed
      );
  }else{
    m.streak=0;
    m.next=time()+600000;
  }

  m.avg=
    m.avg==null
      ?a.elapsed
      :Math.round(
        m.avg*.7+
        a.elapsed*.3
      );

  if(
    w.stage==="review"&&
    mastery(w)
  ){
    w.stage="mastered";
    m.next=0;

    notify(
      `已掌握：${w.latin}，已自动移入“已掌握”`
    );
  }

  save();
  render();
}


/* =========================================================
   结束练习
   ========================================================= */

function exitQuiz(){
  if(!mode)return;

  if(advanceTimer){
    clearTimeout(advanceTimer);
    advanceTimer=null;
  }

  clearInterval(timer);

  $("#quizShade").classList.add("hidden");

  let s={
    id:id(),
    mode,
    startedAt:start,
    endedAt:time(),
    duration:time()-start,
    answers:answers.slice()
  };

  sessions.push(s);
  sessions=sessions.slice(-300);

  save();

  result=s;

  showResult(s);

  mode=null;

  render();

  sync();
}


/* =========================================================
   结果
   ========================================================= */

function showResult(s){
  if(!s)return;

  result=s;

  let aa=s.answers||[],
      correct=aa.filter(
        a=>a.correct
      ).length;

  $("#resultTitle").textContent=
    label(s.mode)+" · 答题记录";

  $("#summary").innerHTML=`
    <div>
      题目数
      <strong>${aa.length}</strong>
    </div>

    <div>
      正确
      <strong>${correct}</strong>
    </div>

    <div>
      正确率
      <strong>
        ${
          aa.length
            ?Math.round(
              correct/aa.length*100
            )+"%"
            :"—"
        }
      </strong>
    </div>

    <div>
      总用时
      <strong>
        ${dur(s.duration||0)}
      </strong>
    </div>
  `;

  $("#resultTable").innerHTML=`
    <table>
      <thead>
        <tr>
          <th># / 题目</th>
          <th>你的答案</th>
          <th>参考答案</th>
          <th>判定</th>
          <th>用时</th>
        </tr>
      </thead>

      <tbody>
        ${
          aa.map((a,i)=>`
            <tr>
              <td>
                ${i+1}. ${esc(a.question)}
                <small>
                  ${esc(a.latin)}
                  ·
                  ${esc(PL[a.pos])}
                </small>
              </td>

              <td>
                ${esc(a.userAnswer)}
              </td>

              <td>
                ${esc(a.expected)}
              </td>

              <td>
                ${a.correct?"正确":"错误"}
              </td>

              <td>
                ${(a.elapsed/1000).toFixed(1)} 秒
              </td>
            </tr>
          `).join("")
          ||
          `
            <tr>
              <td colspan="5" class="empty">
                本次没有答题记录。
              </td>
            </tr>
          `
        }
      </tbody>
    </table>
  `;

  $("#resultShade").classList.remove("hidden");
}


/* =========================================================
   模板
   ========================================================= */

function template(){
  let rows=[
    H.join(","),
    "puella,女孩,noun,puellae,feminine,,,,,,,,第一变格名词",
    "regō,统治,verb,,,,,regō,rēxī,rēxeram,regam,regere,第三变位示例；请核验具体词形",
    "bonus,好的,adjective,,,bona,bonum,,,,,,第一第二变格形容词"
  ];

  download(
    "latin-vocabulary-template.csv",
    rows.join("\r\n")
  );
}

function exportWords(){
  download(
    "latin-vocabulary.csv",
    [
      H.join(","),
      ...words.map(
        w=>H.map(
          k=>csvcell(w[k])
        ).join(",")
      )
    ].join("\r\n")
  );
}


/* =========================================================
   设置
   ========================================================= */

function saveSettings(){
  settings={
    url:$("#sbUrl").value.trim(),
    key:$("#sbKey").value.trim(),
    checkerUrl:$("#checkerUrl").value.trim(),
    checkerKey:$("#checkerKey").value.trim()
  };

  localStorage.setItem(
    K.c,
    JSON.stringify(settings)
  );

  initSB();

  $("#settingsMsg").textContent=
    "设置已保存。";

  sync();
}

function initSB(){
  if(
    settings.url&&
    settings.key&&
    window.supabase
  ){
    sb=window.supabase.createClient(
      settings.url,
      settings.key
    );

    $("#syncStatus").textContent=
      "Supabase 已配置";
  }else{
    sb=null;

    $("#syncStatus").textContent=
      "本地模式";
  }
}


/* =========================================================
   登录
   ========================================================= */

async function auth(action){
  if(!sb)
    return alert(
      "请先保存 Supabase URL 和 publishable/anon key"
    );

  let email=$("#email").value,
      password=$("#password").value;

  if(!email||!password)
    return alert(
      "请填写邮箱和密码"
    );

  let res=
    action==="signup"
      ?await sb.auth.signUp({
        email,
        password
      })
      :action==="login"
        ?await sb.auth.signInWithPassword({
          email,
          password
        })
        :await sb.auth.signOut();

  if(res.error)
    return alert(res.error.message);

  if(action==="logout"){
    user=null;

    $("#syncStatus").textContent=
      "已退出登录";
  }else{
    user=res.data.user;

    notify(
      action==="signup"
        ?"注册请求已提交；如开启邮箱验证请先验证邮箱"
        :"登录成功"
    );

    await pull();
    await sync();
  }
}


/* =========================================================
   Supabase 同步
   ========================================================= */

async function sync(){
  if(!sb)return;

  try{
    let {data,error}=await sb.auth.getUser();

    if(error)throw error;

    if(!data.user){
      $("#syncStatus").textContent=
        "请登录后同步";
      return;
    }

    user=data.user;

    let vs=words.map(w=>({
      id:w.id,
      user_id:user.id,
      latin:w.latin,
      meaning:w.meaning,
      pos:w.pos,
      genitive:w.genitive||null,
      gender:w.gender||null,
      feminine:w.feminine||null,
      neuter:w.neuter||null,
      present_1sg:w.present_1sg||null,
      perfect_1sg:w.perfect_1sg||null,
      pluperfect_1sg:w.pluperfect_1sg||null,
      future_1sg:w.future_1sg||null,
      infinitive:w.infinitive||null,
      notes:w.notes||null,
      stage:w.stage||"new",
      created_at:new Date(
        w.createdAt||time()
      ).toISOString(),
      batch_date:w.batchDate||null
    }));

    if(vs.length){
      let x=await sb
        .from("vocabulary")
        .upsert(
          vs,
          {
            onConflict:"id"
          }
        );

      if(x.error)throw x.error;
    }

    let rs=Object.values(records).map(r=>({
      user_id:user.id,
      word_id:r.wordId,
      progress:r,
      updated_at:new Date().toISOString()
    }));

    if(rs.length){
      let x=await sb
        .from("learning_records")
        .upsert(
          rs,
          {
            onConflict:"user_id,word_id"
          }
        );

      if(x.error)throw x.error;
    }

    let ss=sessions.map(s=>({
      id:s.id,
      user_id:user.id,
      mode:s.mode,
      started_at:new Date(
        s.startedAt
      ).toISOString(),
      ended_at:new Date(
        s.endedAt
      ).toISOString(),
      duration_ms:s.duration,
      answers:s.answers
    }));

    if(ss.length){
      let x=await sb
        .from("practice_sessions")
        .upsert(
          ss,
          {
            onConflict:"id"
          }
        );

      if(x.error)throw x.error;
    }

    $("#syncStatus").textContent=
      "同步成功";

  }catch(e){
    $("#syncStatus").textContent=
      "同步失败："+e.message;

    console.error(e);
  }
}


/* =========================================================
   从 Supabase 拉取
   ========================================================= */

async function pull(){
  if(!sb)return;

  try{
    let {data,error}=await sb.auth.getUser();

    if(error||!data.user)return;

    user=data.user;

    let [v,r,s]=await Promise.all([
      sb
        .from("vocabulary")
        .select("*")
        .eq("user_id",user.id),

      sb
        .from("learning_records")
        .select("*")
        .eq("user_id",user.id),

      sb
        .from("practice_sessions")
        .select("*")
        .eq("user_id",user.id)
        .order("ended_at")
    ]);

    if(v.error||r.error||s.error)
      throw v.error||r.error||s.error;

    let map=new Map(
      words.map(w=>[w.id,w])
    );

    (v.data||[]).forEach(x=>{
      map.set(
        x.id,
        {
          ...x,
          stage:x.stage||"new",
          createdAt:x.created_at
            ?new Date(x.created_at).getTime()
            :time(),
          batchDate:x.batch_date||""
        }
      );
    });

    words=[...map.values()]
      .map(ensureStage);

    (r.data||[]).forEach(x=>{
      records[x.word_id]=x.progress;
    });

    if(s.data?.length){
      let sm=new Map(
        sessions.map(
          x=>[x.id,x]
        )
      );

      s.data.forEach(x=>{
        sm.set(
          x.id,
          {
            id:x.id,
            mode:x.mode,
            startedAt:new Date(
              x.started_at
            ).getTime(),
            endedAt:new Date(
              x.ended_at
            ).getTime(),
            duration:x.duration_ms,
            answers:x.answers||[]
          }
        );
      });

      sessions=[...sm.values()]
        .slice(-300);
    }

    refreshStages();
    save();
    render();

    $("#syncStatus").textContent=
      "已同步";

  }catch(e){
    console.warn(e);

    $("#syncStatus").textContent=
      "同步失败："+e.message;
  }
}


/* =========================================================
   事件绑定
   ========================================================= */

function bind(){

  $("#choose").onclick=
    ()=>$("#csv").click();

  $("#csv").onchange=async e=>{
    let f=e.target.files[0];

    if(f){
      try{
        importCSV(await f.text());
      }catch(err){
        $("#importMsg").textContent=
          err.message;
      }
    }

    e.target.value="";
  };

  $("#drop").ondragover=e=>{
    e.preventDefault();
    $("#drop").style.background="#e6efe6";
  };

  $("#drop").ondrop=async e=>{
    e.preventDefault();

    let f=e.dataTransfer.files[0];

    if(f){
      try{
        importCSV(await f.text());
      }catch(err){
        $("#importMsg").textContent=
          err.message;
      }
    }
  };

  $("#template").onclick=template;

  $("#export").onclick=exportWords;

  $("#search").oninput=render;

  $("#newMeaning").onclick=
    ()=>startQuiz("new-meaning");

  $("#reviewMeaning").onclick=
    ()=>startQuiz("review-meaning");

  $("#reviewSpelling").onclick=
    ()=>startQuiz("review-spelling");

  $("#moveAll").onclick=
    moveAllNewToReview;

  $("#review").onclick=
    ()=>startQuiz("review-meaning");

  $("#jumpImport").onclick=
    ()=>$("#importPanel").scrollIntoView({
      behavior:"smooth"
    });

  $("#exit").onclick=()=>{
    if(
      confirm(
        "退出练习并查看本次题目与答案？"
      )
    ){
      exitQuiz();
    }
  };

  $("#closeResult").onclick=
    $("#finish").onclick=
      ()=>$("#resultShade").classList.add("hidden");

  $("#downloadSession").onclick=()=>{
    if(result){
      download(
        "latin-session.csv",
        [
          [
            "question",
            "latin",
            "meaning",
            "userAnswer",
            "expected",
            "correct",
            "elapsed_ms"
          ].join(","),

          ...result.answers.map(a=>
            [
              a.question,
              a.latin,
              a.meaning,
              a.userAnswer,
              a.expected,
              a.correct,
              a.elapsed
            ]
            .map(csvcell)
            .join(",")
          )
        ].join("\r\n")
      );
    }
  };

  $("#settingsOpen").onclick=
    ()=>$("#settingsShade").classList.remove("hidden");

  $("#closeSettings").onclick=
    ()=>$("#settingsShade").classList.add("hidden");

  $("#saveSettings").onclick=
    saveSettings;

  $("#signup").onclick=
    ()=>auth("signup");

  $("#login").onclick=
    ()=>auth("login");

  $("#logout").onclick=
    ()=>auth("logout");

  $("#sync").onclick=async()=>{
    await pull();
    await sync();
  };

  $("#history").onclick=()=>{
    sessions.length
      ?showResult(
        sessions[sessions.length-1]
      )
      :notify("还没有记录");
  };
}


/* =========================================================
   初始化
   ========================================================= */

function init(){

  words=read(K.w,[])
    .map(ensureStage);

  records=read(K.r,{});

  sessions=read(K.s,[]);

  settings=read(
    K.c,
    {
      url:CFG.SUPABASE_URL||"",
      key:CFG.SUPABASE_ANON_KEY||"",
      checkerUrl:CFG.LATIN_CHECKER_URL||"",
      checkerKey:CFG.LATIN_CHECKER_KEY||""
    }
  );

  $("#sbUrl").value=settings.url;
  $("#sbKey").value=settings.key;
  $("#checkerUrl").value=settings.checkerUrl;
  $("#checkerKey").value=settings.checkerKey;

  initSB();
  bind();
  render();

  if(sb)
    pull();
}

init();

})();