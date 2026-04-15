import { useState, useEffect } from "react";

// Apollo Brand Guidelines 2023 — exact palette
const A = {
  // Primary
  horizon:       "#FC5200",  // Horizon primary
  horizonDark:   "#943000",  // Horizon dark shade
  horizonLight:  "#FF9461",  // Horizon light shade
  horizonFaint:  "#FFEADB",  // Regolith (warm cream)
  // Secondary
  nebula:        "#15252D",  // Nebula dark bg
  nebulaDark:    "#0B1418",  // Nebula darker
  nebulaLight:   "#254250",  // Nebula lighter
  satellite:     "#CFD7D6",  // Satellite light
  satelliteLight:"#ECEFEE",  // Satellite very light
  // Tertiary
  titan:         "#FCD200",  // Titan yellow
  aurora:        "#00FCB5",  // Aurora green
  neptune:       "#0083FC",  // Neptune blue
  cosmos:        "#7B00C7",  // Cosmos purple
  // Neutrals
  white:         "#FFFFFF",
  offWhite:      "#F9FAFA",
  text:          "#15252D",  // Dark text on light bg
  textMuted:     "#467B95",  // Muted on dark
};

const WEBHOOK_URL = "https://script.google.com/a/macros/apollographql.com/s/AKfycbwMtKFJARhDnPP-HI_ljFQjNqxiV7zt3GhI1Xno-teMOfA3nftfSBkT9wWge6eQIyRg/exec";

const CUSTOMER_CLUSTERS = {
  "Financial services": ["Capital One","JPMorgan Chase & Co.","Fidelity Investments","Vanguard Group","Block","Brex","Coinbase","Santander Bank","Royal Bank Of Canada","U.S. Bank National Association","Experian","Gusto","Northwestern Mutual","Liberty Mutual Insurance","State Farm","Varo Money","GoodLeap","Remitly","Kiwibank","Edward Jones","Fenergo","BCP","Medica"],
  "Retail & ecommerce": ["Walmart","Sephora","Wayfair","Stitch Fix","Fabletics Inc","Selfridges Retail Limited","Sainsbury's","WooliesX","H-E-B","PETCO Animal Supplies","Jumbo Supermarkten","Coolblue","QVC","RS Components","On-running","Crumbl Cookies","Starbucks Corporation"],
  "Automotive & mobility": ["Ford","Rivian Automotive","Volkswagen Group Of America","Cox Automotive","Joby Aviation","EVgo","Cummins","AUDI AG"],
  "Media & entertainment": ["Netflix, Inc.","The Walt Disney Company","Sony","Warner Bros Discovery","The New York Times","Riot Games","Ticketmaster","Pandora","Snap","MLB","Sony Music Entertainment","Dow Jones","The Pokémon Company International","PokerStars","Conde Nast Publications","Ancient Gaming"],
  "Healthcare & life sciences": ["CVS Health","Humana","Athenahealth","GoodRx","Optum","Modern Health","Included Health","Cambia Health Solutions","Vitality","Baxter Healthcare Corporation","Abbvie","Dasa","Ascension Healthcare Corporation","CoverMyMeds","GoHealth"],
  "Technology & SaaS": ["Adobe","Atlassian","Zendesk","Intuit","PayPal","Pinterest","DoorDash","Zapier","SurveyMonkey","Zillow Group","AlphaSense","Indeed","Wiz, Inc.","Doximity","SecureWorks","Dell Technologies","NetApp","The Trade Desk","Salsify","Red Hat","SmartHR","monday.com LTD","Thinkific","Sendoso","Wood Mackenzie","Mindbody"],
  "Travel & hospitality": ["Marriott International","Hyatt Hotels Corporation","MGM Resorts International","Whitbread","IHG Hotels & Resorts","Trivago","Expedia","Booking Holdings Inc.","Viator","FCM Travel","GetYourGuide"],
  "Education": ["EF Education First","Preply","Varsity Tutors, a Nerdy Company","Parchment","Encoura","Continued.com","Bethink Labs"],
  "Food & beverage": ["HelloFresh","Yum! Brands","Sysco","Ahold Delhaize - ADUSA","Provi","Galley Solutions","Ezcater","HEINEKEN Global Shared Services"],
  "Energy & utilities": ["National Grid","LichtBlick SE","Fortum","Alberta Energy Regulator","World Kinect Energy Services","Nutrien"],
  "Logistics & supply chain": ["Expeditors International","Flexport","Delivery Hero","DAT Solutions","Mastery Logistics Systems","Shipt"],
  "Telecom & infrastructure": ["AT&T","Charter Communications","T-Mobile","American Airlines"],
  "Fashion & luxury": ["Christian Dior Couture","Burberry Ltd","Custom Ink","Restoration Hardware","GrandVision"],
  "Enterprise software & HR": ["Autodesk Construction Cloud","O.C. Tanner","Poppulo","S&P Global","VelocityEHS","TripleLift","Care.com","Peloton Interactive","Thrive Global","Ricoh Europe PLC"],
  "Government & defence": ["Army National Guard","Transport for NSW","Smart Service Queensland","Conquest Cyber"],
};

const DEFAULT_RULES = [
  "NEVER use dashes (em dashes, en dashes, hyphens as punctuation). Rewrite any sentence that would naturally use one.",
  "Do NOT reveal you know they visited specific pages. Weave the topic naturally as a reason to reach out.",
  "Write like a human. Avoid hollow phrases like \"I hope this finds you well\", \"I wanted to reach out\", \"touch base\", or \"synergy\".",
  "Reference 1-2 similar customers from the customer list based on the prospect's industry, size, or business model.",
  "Be conversational, specific, and warm. Never templated.",
  "Always ensure the introductory phrases tie back to why we are reaching out. There must be a consistent theme.",
  "Prefer the Apollo customer reference / value statement after the pain statement. Do not open the second paragraph with \"we work with\".",
  "Always tie back your research into GraphOS in order to avoid confusion about our call to action.",
  "Be clear with a specific call to action. Claude should have a preference to not make it an ask of the reader to share more, but rather for Apollo to demonstrate value first.",
  "Most outreach will send to large companies. Consider if your research is relevant to the prospect.",
];

const DEFAULT_S1 = [
  "Pages visited on our site — infer the prospect's interests and pain points from the URL paths and content",
  "LinkedIn profile — recent posts, job changes, shared articles, and activity that signals current priorities",
  "Company news — funding rounds, product launches, executive hires, or press coverage in the last 90 days",
  "Industry trends — recent developments in the prospect's sector relevant to their role",
  "Web search — any public talks, podcasts, interviews, or written content by the prospect or their company",
];

const DEFAULT_S2 = [
  "Search SEC EDGAR (edgar.sec.gov) for recent filings or earnings reports if the company appears to be publicly traded",
  "Seeking Alpha — search for recent earnings call transcripts",
  "Review the original email sent and identify new angles, updated context, or value-adds not covered in the first message",
];

function buildSystem(rules, s1) {
  const clusters = Object.entries(CUSTOMER_CLUSTERS).map(([s,cs])=>`${s}: ${cs.slice(0,3).join(", ")}`).join("\n");
  const rt = rules.map((r,i)=>`${i+1}. ${r}`).join("\n");
  const rst = s1.map((r,i)=>`${i+1}. ${r}`).join("\n");
  return `You are a B2B outreach specialist for Apollo GraphQL. Draft a personalized email and LinkedIn message using only the prospect data provided.\nUse these signals:\n${rst}\nWriting rules:\n${rt}\nSample customers (pick 1-2 most relevant):\n${clusters}\nRespond ONLY with raw JSON:\n{"url_insights":"...","linkedin_insights":"...","web_insights":"...","email_subject":"...","email_body":"...","linkedin_message":"..."}`;
}

function buildFollowUpSystem(s2) {
  return `You are a B2B outreach specialist writing a follow-up email.\nResearch using:\n${s2.map((r,i)=>`${i+1}. ${r}`).join("\n")}\nRules: NEVER use dashes. Acknowledge the previous email briefly then lead with new value. Use something specific as the hook. Under 100 words.\nRespond ONLY with raw JSON: {"search_context":"...","email_subject":"...","email_body":"..."}`;
}

async function callAPI(messages, system, useSearch) {
  const body = { model:"claude-sonnet-4-20250514", max_tokens:1500, system, messages };
  if (useSearch) body.tools = [{ type:"web_search_20250305", name:"web_search" }];
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)
  });
  return r.json();
}

function extractJSON(data) {
  const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
  const s=text.indexOf("{"), e=text.lastIndexOf("}");
  if(s===-1||e===-1) return null;
  try { return JSON.parse(text.slice(s,e+1)); } catch { return null; }
}

async function runGenerate(msg, system) {
  const to = new Promise((_,rej)=>setTimeout(()=>rej(new Error("Timed out. Please retry.")),20000));
  const data = await Promise.race([callAPI([{role:"user",content:msg}],system,false),to]);
  if(data.error) throw new Error(data.error.message);
  const r = extractJSON(data);
  if(r) return r;
  throw new Error("Could not parse response. Please retry.");
}

async function runFollowUp(msg, system) {
  let data = await callAPI([{role:"user",content:msg}],system,true);
  if(data.error) throw new Error(data.error.message);
  let r = extractJSON(data);
  if(!r && data.stop_reason==="tool_use") {
    const tr=(data.content||[]).filter(b=>b.type==="tool_use").map(b=>({type:"tool_result",tool_use_id:b.id,content:"Done."}));
    const d2=await callAPI([{role:"user",content:msg},{role:"assistant",content:data.content},{role:"user",content:tr.length?tr:"Return JSON."}],system,false);
    r=extractJSON(d2);
  }
  if(r) return r;
  throw new Error("Could not parse follow-up response.");
}

async function postToSheet(item) {
  if(!WEBHOOK_URL) return;
  try {
    await fetch(WEBHOOK_URL,{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({name:item.name,title:item.title,company:item.company,email:item.email,linkedin:item.linkedin,
        email_subject:item.result?.email_subject||"",email_body:item.result?.email_body||"",
        linkedin_message:item.result?.linkedin_message||"",url_insights:item.result?.url_insights||"",
        linkedin_insights:item.result?.linkedin_insights||"",web_insights:item.result?.web_insights||"",visited_urls:item.urls||""})
    });
  } catch(e){}
}

function workDaysSince(date) {
  let n=0,d=new Date(date),now=new Date();
  while(d<now){d.setDate(d.getDate()+1);const w=d.getDay();if(w&&w!==6)n++;}
  return n;
}

function Timer() {
  const [s,setS]=useState(0);
  useEffect(()=>{const t=setInterval(()=>setS(x=>x+1),1000);return()=>clearInterval(t);},[]);
  return <span style={{color:A.textMuted,marginLeft:6,fontSize:12}}>{s}s</span>;
}

function Avatar({name,size=36}) {
  const initials=(name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  const clrs=[A.horizon,A.horizonDark,A.neptune,A.cosmos,A.aurora];
  const clr=clrs[(name||"").charCodeAt(0)%clrs.length]||A.horizon;
  return (
    <div style={{width:size,height:size,borderRadius:"50%",background:clr,display:"flex",alignItems:"center",
      justifyContent:"center",fontSize:size*0.35,fontWeight:700,color:A.white,flexShrink:0,letterSpacing:"0.03em"}}>
      {initials}
    </div>
  );
}

function StatusPill({status}) {
  const cfg={
    pending:    {label:"Pending",   bg:`${A.satellite}33`,  color:A.nebulaLight},
    generating: {label:"Drafting…", bg:`${A.titan}22`,      color:"#8B7000"},
    ready:      {label:"Ready",     bg:`${A.aurora}22`,     color:"#007A5A"},
    sent:       {label:"Sent",      bg:`${A.neptune}22`,    color:A.neptune},
    error:      {label:"Error",     bg:`${A.horizon}22`,    color:A.horizonDark},
  };
  const c=cfg[status]||cfg.pending;
  return (
    <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,
      background:c.bg,color:c.color,letterSpacing:"0.05em",textTransform:"uppercase",whiteSpace:"nowrap"}}>
      {c.label}
    </span>
  );
}

const inp = (dark=true) => ({
  width:"100%",padding:"9px 12px",borderRadius:8,
  border:`1px solid ${dark?A.nebulaLight:A.satellite}`,
  background:dark?A.nebulaDark:A.white,
  color:dark?A.white:A.text,
  fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"
});
const lbl = {fontSize:11,fontWeight:700,color:A.textMuted,marginBottom:5,display:"block",textTransform:"uppercase",letterSpacing:"0.08em"};

function Btn({children,onClick,disabled,variant="primary",small=false,style={}}) {
  const vs={
    primary:   {background:A.horizon,     color:A.white,  border:"none"},
    secondary: {background:"transparent", color:A.nebula, border:`1px solid ${A.satellite}`},
    secondaryDark:{background:"transparent",color:A.satellite,border:`1px solid ${A.nebulaLight}`},
    ghost:     {background:"transparent", color:A.horizon, border:"none"},
    success:   {background:`${A.aurora}22`,color:"#007A5A",border:`1px solid ${A.aurora}44`},
    danger:    {background:"transparent", color:A.horizonDark,border:`1px solid ${A.horizon}44`},
  };
  const v=vs[variant]||vs.primary;
  return (
    <button onClick={onClick} disabled={disabled}
      style={{padding:small?"5px 12px":"8px 18px",borderRadius:8,fontSize:small?12:13,fontWeight:600,
        cursor:disabled?"default":"pointer",fontFamily:"inherit",opacity:disabled?0.45:1,
        transition:"opacity 0.15s",...v,...style}}>
      {children}
    </button>
  );
}

function EditableList({items,onChange,placeholder,dark=false}) {
  const [n,setN]=useState("");
  return (
    <div>
      {items.map((item,i)=>(
        <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:8}}>
          <div style={{fontSize:12,color:A.textMuted,paddingTop:11,minWidth:20,textAlign:"right"}}>{i+1}.</div>
          <textarea value={item} onChange={e=>onChange(items.map((x,j)=>j===i?e.target.value:x))}
            style={{...inp(dark),flex:1,minHeight:52,resize:"vertical",fontSize:13,lineHeight:1.6}}/>
          <button onClick={()=>onChange(items.filter((_,j)=>j!==i))}
            style={{padding:"8px 10px",borderRadius:6,border:`1px solid ${A.satellite}`,background:"transparent",
              fontSize:12,cursor:"pointer",color:A.horizon,fontFamily:"inherit",marginTop:2}}>✕</button>
        </div>
      ))}
      <div style={{display:"flex",gap:8,marginTop:12,alignItems:"flex-start"}}>
        <textarea value={n} onChange={e=>setN(e.target.value)} placeholder={placeholder}
          style={{...inp(dark),flex:1,minHeight:48,resize:"vertical",fontSize:13}}/>
        <Btn onClick={()=>{if(n.trim()){onChange([...items,n.trim()]);setN("");}}} disabled={!n.trim()} style={{marginTop:2}}>Add</Btn>
      </div>
    </div>
  );
}

function ProspectForm({onAdd,onUpdate,loading,editingProspect,onClearEdit}) {
  const blank={name:"",title:"",company:"",email:"",linkedin:"",urls:"",extra:""};
  const [f,setF]=useState(blank);
  const upd=k=>e=>setF(p=>({...p,[k]:e.target.value}));
  const isEditing=!!editingProspect;
  useEffect(()=>{setF(editingProspect||blank);},[editingProspect]);
  function submit(){
    if(!f.urls.trim()&&!f.extra.trim())return;
    if(isEditing){onUpdate(f);onClearEdit();}else{onAdd(f);setF(blank);}
  }
  return (
    <div style={{background:A.white,borderRadius:12,border:`1px solid ${A.satellite}`,padding:20,marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:700,color:A.text}}>
          {isEditing?`Editing — ${editingProspect.name||"prospect"}`:"Add prospect"}
        </div>
        {isEditing&&<button onClick={onClearEdit} style={{fontSize:12,color:A.textMuted,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",textDecoration:"underline"}}>Cancel</button>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:12}}>
        {[["Name","Jane Smith","name"],["Title","VP Engineering","title"],["Company","Acme","company"],["Email","jane@acme.com","email"]].map(([l,p,k])=>(
          <div key={k}><span style={{...lbl,color:A.text}}>{l}</span><input style={inp(false)} placeholder={p} value={f[k]} onChange={upd(k)}/></div>
        ))}
      </div>
      <div style={{marginBottom:12}}><span style={{...lbl,color:A.text}}>LinkedIn URL</span>
        <input style={inp(false)} placeholder="https://linkedin.com/in/..." value={f.linkedin} onChange={upd("linkedin")}/></div>
      <div style={{marginBottom:12}}>
        <span style={{...lbl,color:A.text}}>Pages visited (one URL per line)</span>
        <textarea style={{...inp(false),minHeight:56,fontFamily:"monospace",fontSize:12}} placeholder="https://apollographql.com/docs/..." value={f.urls} onChange={upd("urls")}/>
      </div>
      <div style={{marginBottom:16}}>
        <span style={{...lbl,color:A.text}}>Extra context</span>
        <textarea style={{...inp(false),minHeight:44}} placeholder="e.g. Attended MCP Apps Livestream, uses AWS..." value={f.extra} onChange={upd("extra")}/>
      </div>
      <Btn onClick={submit} disabled={(!f.urls.trim()&&!f.extra.trim())||loading}>
        {isEditing?"Save changes":"Add to queue"}
      </Btn>
    </div>
  );
}

function FeedbackPanel({item,field,currentText,onUpdate}) {
  const [fb,setFb]=useState("");
  const [busy,setBusy]=useState(false);
  const [hist,setHist]=useState([]);
  const labels={email_body:"email",email_subject:"subject line",linkedin_message:"LinkedIn message"};
  async function refine(){
    if(!fb.trim())return;
    setBusy(true);
    try{
      const data=await callAPI([{role:"user",content:`Current ${labels[field]}:\n${currentText}\n\nProspect: ${item.name}, ${item.title} at ${item.company}\n\nFeedback: ${fb}\n\nRewrite. Never use dashes. Return ONLY the rewritten text.`}],
        `B2B outreach copywriter. Never use dashes. Return ONLY the rewritten text.`,false);
      const t=(data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("").trim();
      if(t){setHist(h=>[...h,{fb,prev:currentText}]);onUpdate(field,t);setFb("");}
    }catch(e){}
    setBusy(false);
  }
  return (
    <div style={{marginTop:14,padding:16,borderRadius:10,background:A.horizonFaint,border:`1px solid ${A.horizonLight}44`}}>
      <div style={{fontSize:11,fontWeight:700,color:A.horizon,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.08em"}}>Refine with AI</div>
      {hist.map((h,i)=>(
        <div key={i} style={{fontSize:12,color:A.textMuted,padding:"3px 0",borderBottom:`1px solid ${A.satellite}`,marginBottom:4,display:"flex",justifyContent:"space-between"}}>
          <span>"{h.fb}"</span>
          <button onClick={()=>onUpdate(field,h.prev)} style={{fontSize:11,color:A.horizon,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>undo</button>
        </div>
      ))}
      <div style={{display:"flex",gap:8}}>
        <textarea value={fb} onChange={e=>setFb(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey))refine();}}
          placeholder={`"Make it shorter", "Open with a question", "Less salesy"...`}
          style={{...inp(false),minHeight:52,flex:1,resize:"none",fontSize:13}}/>
        <Btn onClick={refine} disabled={!fb.trim()||busy} style={{alignSelf:"stretch",padding:"0 16px"}}>
          {busy?"…":"Refine"}
        </Btn>
      </div>
      <div style={{fontSize:11,color:A.textMuted,marginTop:5}}>Cmd+Enter to submit</div>
    </div>
  );
}

function FollowUpPanel({item,s2}) {
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState(null);
  const [err,setErr]=useState("");
  const [subj,setSubj]=useState("");
  const [body,setBody]=useState("");
  const [copied,setCopied]=useState(false);
  async function generate(){
    setBusy(true);setResult(null);setErr("");
    const msg=`Follow-up for: ${item.name}, ${item.title} at ${item.company}\nOriginal subject: ${item.result?.email_subject||""}\nOriginal body: ${item.result?.email_body||""}\nSent: ${item.sentAt?new Date(item.sentAt).toDateString():"recently"}\nResearch and return the JSON.`;
    try{const res=await runFollowUp(msg,buildFollowUpSystem(s2));setResult(res);setSubj(res.email_subject||"");setBody(res.email_body||"");}
    catch(e){setErr(e.message);}
    setBusy(false);
  }
  return (
    <div style={{marginTop:16,padding:16,borderRadius:10,background:A.white,border:`2px solid ${A.horizon}33`}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div style={{fontSize:13,fontWeight:700,color:A.text}}>Follow-up generator</div>
        {!result&&!busy&&<Btn onClick={generate}>Generate follow-up</Btn>}
        {busy&&<span style={{fontSize:12,color:A.textMuted}}>Searching…</span>}
      </div>
      {err&&<div style={{fontSize:13,color:A.horizon,marginBottom:8}}>{err}</div>}
      {result&&(
        <div>
          {result.search_context&&(
            <div style={{padding:12,borderRadius:8,background:A.horizonFaint,borderLeft:`3px solid ${A.horizon}`,marginBottom:12,fontSize:12,color:A.text,lineHeight:1.6}}>
              <span style={{fontWeight:700,color:A.horizon,fontSize:11,textTransform:"uppercase",letterSpacing:"0.06em"}}>Hook: </span>{result.search_context}
            </div>
          )}
          <div style={{borderRadius:8,border:`1px solid ${A.satellite}`,overflow:"hidden",marginBottom:12}}>
            <div style={{padding:"8px 12px",background:A.satelliteLight,borderBottom:`1px solid ${A.satellite}`,display:"flex",alignItems:"center",gap:8}}>
              <span style={{...lbl,color:A.text,marginBottom:0}}>Subject</span>
              <input value={subj} onChange={e=>setSubj(e.target.value)} style={{...inp(false),flex:1,padding:"2px 8px",fontSize:13,border:"none",background:"transparent"}}/>
            </div>
            <textarea value={body} onChange={e=>setBody(e.target.value)} style={{...inp(false),minHeight:120,border:"none",borderRadius:0,padding:14,fontSize:14,lineHeight:1.85}}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <Btn variant="secondary" onClick={()=>{navigator.clipboard.writeText(`Subject: ${subj}\n\n${body}`);setCopied(true);setTimeout(()=>setCopied(false),2000);}}>{copied?"Copied!":"Copy"}</Btn>
            <Btn variant="ghost" onClick={generate}>Regenerate</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailPanel({item,onChange,onSendGmail,onMarkSent,onEditProspect,s2}) {
  const [tab,setTab]=useState("email");
  const [copied,setCopied]=useState(false);
  const r=item.result;
  if(!r) return (
    <div style={{background:A.white,borderRadius:12,border:`1px solid ${A.satellite}`,padding:40,textAlign:"center"}}>
      {item.status==="generating"&&<div style={{color:A.textMuted,display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>Drafting your message<Timer/></div>}
      {item.status==="error"&&<div><div style={{color:A.horizon,marginBottom:8,fontSize:13,fontWeight:600}}>{item.error||"Error generating."}</div><div style={{fontSize:12,color:A.textMuted}}>Click Retry in the queue.</div></div>}
      {item.status==="pending"&&<div style={{color:A.textMuted}}>Click Generate to create outreach messages</div>}
    </div>
  );
  function edit(f,v){onChange({...item,result:{...r,[f]:v}});}
  function copy(){navigator.clipboard.writeText(tab==="email"?`Subject: ${r.email_subject}\n\n${r.email_body}`:r.linkedin_message);setCopied(true);setTimeout(()=>setCopied(false),2000);}
  return (
    <div>
      {/* Insight cards — Nebula background */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
        {[{k:"url_insights",l:"Page insights",c:A.horizon,bg:A.horizonFaint},
          {k:"linkedin_insights",l:"LinkedIn insights",c:A.neptune,bg:`${A.neptune}10`},
          {k:"web_insights",l:"Web context",c:"#007A5A",bg:`${A.aurora}15`}].map(({k,l,c,bg})=>(
          <div key={k} style={{padding:12,borderRadius:8,background:bg,borderLeft:`3px solid ${c}`}}>
            <div style={{fontSize:10,fontWeight:700,color:c,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>{l}</div>
            <div style={{fontSize:12,color:A.text,lineHeight:1.6}}>{r[k]||"—"}</div>
          </div>
        ))}
      </div>

      {/* Tab switcher */}
      <div style={{display:"flex",gap:4,marginBottom:12,background:A.satelliteLight,borderRadius:8,padding:4}}>
        {["email","linkedin"].map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{flex:1,padding:"7px 0",borderRadius:6,border:"none",fontSize:13,cursor:"pointer",
              fontFamily:"inherit",fontWeight:600,transition:"all 0.15s",
              background:tab===t?A.nebula:"transparent",
              color:tab===t?A.white:A.text}}>
            {t==="email"?"Email":"LinkedIn DM"}
          </button>
        ))}
      </div>

      {tab==="email"&&(
        <div style={{borderRadius:10,border:`1px solid ${A.satellite}`,overflow:"hidden"}}>
          <div style={{padding:"10px 14px",background:A.satelliteLight,borderBottom:`1px solid ${A.satellite}`,display:"flex",alignItems:"center",gap:10}}>
            <span style={{...lbl,color:A.text,marginBottom:0}}>Subject</span>
            <input value={r.email_subject||""} onChange={e=>edit("email_subject",e.target.value)} style={{...inp(false),flex:1,padding:"2px 8px",fontSize:13,border:"none",background:"transparent"}}/>
          </div>
          <textarea value={r.email_body||""} onChange={e=>edit("email_body",e.target.value)} style={{...inp(false),minHeight:160,border:"none",borderRadius:0,padding:16,fontSize:14,lineHeight:1.85}}/>
        </div>
      )}
      {tab==="linkedin"&&(
        <textarea value={r.linkedin_message||""} onChange={e=>edit("linkedin_message",e.target.value)} style={{...inp(false),minHeight:120,padding:16,fontSize:14,lineHeight:1.85,borderRadius:10}}/>
      )}

      <FeedbackPanel key={`${item.name}-${tab}`} item={item}
        field={tab==="email"?"email_body":"linkedin_message"}
        currentText={tab==="email"?(r.email_body||""):(r.linkedin_message||"")}
        onUpdate={edit}/>

      <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap",alignItems:"center"}}>
        <Btn variant="secondary" onClick={copy}>{copied?"Copied!":"Copy"}</Btn>
        {tab==="email"&&item.email&&<Btn onClick={onSendGmail}>Create Gmail draft →</Btn>}
        <Btn variant="secondary" onClick={onEditProspect}>Edit prospect</Btn>
        {item.status!=="sent"&&<Btn variant="success" onClick={onMarkSent}>I sent this email</Btn>}
        {item.status==="sent"&&item.sentAt&&<span style={{fontSize:12,color:A.textMuted}}>Sent {workDaysSince(item.sentAt)} work day{workDaysSince(item.sentAt)!==1?"s":""} ago</span>}
      </div>
      {item.status==="sent"&&<FollowUpPanel item={item} s2={s2}/>}
    </div>
  );
}

function QueueItem({item,idx,selected,onSelect,onGenerate,onDelete,onReset,generating}) {
  return (
    <div onClick={()=>onSelect(idx)}
      style={{padding:"12px 14px",borderRadius:10,cursor:"pointer",marginBottom:6,transition:"all 0.12s",
        border:`1px solid ${selected?A.horizon:A.satellite}`,
        background:selected?A.horizonFaint:A.white,
        display:"flex",alignItems:"center",gap:12}}>
      <Avatar name={item.name} size={38}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontWeight:700,color:A.text,marginBottom:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
          {item.name||"Unknown"}
        </div>
        <div style={{fontSize:12,color:A.textMuted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
          {item.title?`${item.title} · `:""}
          <span style={{color:A.text,fontWeight:500}}>{item.company||""}</span>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
        <StatusPill status={item.status}/>
        {item.status==="pending"&&(
          <button onClick={e=>{e.stopPropagation();onGenerate(idx);}} disabled={generating}
            style={{padding:"4px 12px",borderRadius:6,border:`1px solid ${A.horizon}`,fontSize:12,
              cursor:generating?"default":"pointer",background:A.horizon,color:A.white,fontFamily:"inherit",fontWeight:600,opacity:generating?0.5:1}}>
            Generate
          </button>
        )}
        {(item.status==="generating"||item.status==="error")&&(
          <button onClick={e=>{e.stopPropagation();onReset(idx);}}
            style={{padding:"4px 12px",borderRadius:6,border:`1px solid ${A.titan}`,fontSize:12,
              cursor:"pointer",background:`${A.titan}22`,color:"#7A6000",fontFamily:"inherit",fontWeight:600}}>
            {item.status==="generating"?"Unstick":"Retry"}
          </button>
        )}
        <button onClick={e=>{e.stopPropagation();onDelete(idx);}}
          style={{width:26,height:26,borderRadius:6,border:`1px solid ${A.satellite}`,fontSize:11,cursor:"pointer",
            background:"transparent",color:A.textMuted,fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center"}}>
          ✕
        </button>
      </div>
    </div>
  );
}

function SentTab({queue,onSelect,selected}) {
  const sent=queue.filter(i=>i.status==="sent");
  if(!sent.length) return <div style={{textAlign:"center",padding:40,color:A.textMuted,fontSize:14}}>No sent emails yet.</div>;
  return (
    <div>
      {sent.map((item,i)=>{
        const days=workDaysSince(item.sentAt),overdue=days>=3,idx=queue.indexOf(item);
        return (
          <div key={i} onClick={()=>onSelect(idx)}
            style={{padding:"12px 14px",borderRadius:10,marginBottom:6,cursor:"pointer",transition:"all 0.12s",
              border:`1px solid ${selected===idx?A.horizon:overdue?`${A.horizon}66`:A.satellite}`,
              background:selected===idx?A.horizonFaint:overdue?`${A.horizon}08`:A.white,
              display:"flex",alignItems:"center",gap:12}}>
            <Avatar name={item.name} size={38}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,fontWeight:700,color:A.text,marginBottom:1}}>{item.name}</div>
              <div style={{fontSize:12,color:A.textMuted}}>{item.title} · <span style={{color:A.text,fontWeight:500}}>{item.company}</span></div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:12,fontWeight:600,color:overdue?A.horizon:A.textMuted}}>{days} day{days!==1?"s":""} ago</div>
              {overdue&&<div style={{fontSize:11,color:A.horizon,fontWeight:600}}>Follow up</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TabBtn({label,active,onClick,badge,warn}) {
  return (
    <button onClick={onClick}
      style={{padding:"8px 20px",borderRadius:8,fontSize:13,cursor:"pointer",fontFamily:"inherit",
        border:`2px solid ${active?A.nebula:"transparent"}`,
        background:active?A.nebula:"transparent",
        color:active?A.white:warn?A.horizon:A.text,
        fontWeight:active?700:500,transition:"all 0.15s"}}>
      {label}
      {badge!=null&&badge>0&&(
        <span style={{marginLeft:7,padding:"1px 7px",borderRadius:20,fontSize:10,
          background:warn?A.horizon:A.horizonFaint,color:warn?A.white:A.horizon,fontWeight:700}}>
          {badge}
        </span>
      )}
    </button>
  );
}

export default function App() {
  const [queue,setQueue]=useState([]);
  const [sel,setSel]=useState(null);
  const [generating,setGenerating]=useState(false);
  const [gmailMsg,setGmailMsg]=useState("");
  const [mainTab,setMainTab]=useState("queue");
  const [rules,setRules]=useState(DEFAULT_RULES);
  const [s1,setS1]=useState(DEFAULT_S1);
  const [s2,setS2]=useState(DEFAULT_S2);
  const [editIdx,setEditIdx]=useState(null);

  const uq=fn=>setQueue(p=>typeof fn==="function"?fn(p):fn);
  const ui=(idx,upd)=>uq(q=>q.map((it,i)=>i===idx?{...it,...upd}:it));
  const addToQueue=p=>uq(q=>[...q,{...p,status:"pending",result:null,error:null,sentAt:null}]);
  const resetItem=idx=>{ui(idx,{status:"pending",error:null});setGenerating(false);};
  const markSent=idx=>{const item=queue[idx];ui(idx,{status:"sent",sentAt:new Date().toISOString()});setMainTab("sent");setSel(idx);postToSheet(item);};
  const handleUpdate=p=>{if(editIdx===null)return;uq(q=>q.map((it,i)=>i===editIdx?{...it,...p,status:"pending",result:null}:it));};

  async function generate(idx) {
    const item=queue[idx];
    ui(idx,{status:"generating",error:null});
    setGenerating(true);
    const msg=`Prospect: ${item.name||"Unknown"}, ${item.title||"Unknown"} at ${item.company||"Unknown"}\nLinkedIn: ${item.linkedin||"not provided"}\nPages visited:\n${(item.urls||"").split("\n").filter(Boolean).map((u,i)=>`${i+1}. ${u.trim()}`).join("\n")||"None provided"}\nAdditional context: ${item.extra||"none"}\nDraft the outreach and return the JSON.`;
    try{const result=await runGenerate(msg,buildSystem(rules,s1));ui(idx,{status:"ready",result});setSel(idx);}
    catch(e){ui(idx,{status:"error",error:e.message||"Error. Click Retry."});}
    setGenerating(false);
  }

  async function sendGmail(idx) {
    const item=queue[idx];
    if(!item.result||!item.email)return;
    setGmailMsg("Creating draft...");
    try{
      const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:500,
          mcp_servers:[{type:"url",url:"https://gmail.mcp.claude.com/mcp",name:"gmail"}],
          system:"Use Gmail MCP to create a draft. Confirm when done.",
          messages:[{role:"user",content:`Create Gmail draft:\nTo: ${item.email}\nSubject: ${item.result.email_subject}\nBody:\n${item.result.email_body}`}]
        })
      });
      const d=await r.json();
      if(d.error)throw new Error(d.error.message);
      setGmailMsg("Draft created in Gmail ✓");
    }catch(e){setGmailMsg(`Gmail error: ${e.message}`);}
    setTimeout(()=>setGmailMsg(""),4000);
  }

  const selItem=sel!==null?queue[sel]:null;
  const sentCount=queue.filter(i=>i.status==="sent").length;
  const overdueCount=queue.filter(i=>i.status==="sent"&&workDaysSince(i.sentAt)>=3).length;
  const pendingCount=queue.filter(i=>i.status==="pending"||i.status==="ready").length;

  return (
    <div style={{minHeight:"100vh",background:A.offWhite,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
      {/* Header — Nebula dark */}
      <div style={{background:A.nebula,padding:"0 28px",display:"flex",alignItems:"center",justifyContent:"space-between",height:60}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          {/* Apollo "A" logo mark */}
          <div style={{width:36,height:36,borderRadius:"50%",border:`2px solid ${A.horizon}`,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
            <span style={{fontSize:16,fontWeight:900,color:A.white,letterSpacing:"-0.02em"}}>A</span>
            <div style={{position:"absolute",top:-2,right:-2,width:8,height:8,borderRadius:"50%",background:A.horizon}}/>
          </div>
          <div>
            <div style={{fontSize:17,fontWeight:900,color:A.white,letterSpacing:"-0.01em"}}>Voyager 1</div>
            <div style={{fontSize:10,color:A.textMuted,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:600}}>Apollo GraphQL</div>
          </div>
        </div>
        <div style={{fontSize:12,color:A.textMuted,fontWeight:500}}>
          {queue.length>0&&`${queue.length} prospect${queue.length!==1?"s":""} in queue`}
        </div>
      </div>

      {/* Horizon orange accent bar */}
      <div style={{height:3,background:`linear-gradient(90deg,${A.horizon},${A.horizonLight},${A.titan})`}}/>

      <div style={{padding:"24px 28px"}}>
        {/* Nav */}
        <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap",background:A.satelliteLight,borderRadius:10,padding:6}}>
          <TabBtn label="Queue" active={mainTab==="queue"} onClick={()=>setMainTab("queue")} badge={pendingCount}/>
          <TabBtn label="Sent" active={mainTab==="sent"} onClick={()=>setMainTab("sent")} badge={overdueCount>0?overdueCount:sentCount} warn={overdueCount>0}/>
          <TabBtn label="Copy Rules" active={mainTab==="rules"} onClick={()=>setMainTab("rules")}/>
          <TabBtn label="Research Areas" active={mainTab==="research"} onClick={()=>setMainTab("research")}/>
        </div>

        {mainTab==="queue"&&(
          <>
            <ProspectForm onAdd={addToQueue} onUpdate={handleUpdate} loading={generating}
              editingProspect={editIdx!==null?queue[editIdx]:null} onClearEdit={()=>setEditIdx(null)}/>
            {queue.length>0&&(
              <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:16}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:A.textMuted,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.08em"}}>Queue · {queue.length}</div>
                  {queue.map((item,idx)=>(
                    <QueueItem key={idx} item={item} idx={idx} selected={sel===idx}
                      onSelect={setSel} onGenerate={generate} onReset={resetItem}
                      onDelete={i=>{uq(q=>q.filter((_,j)=>j!==i));if(sel===i)setSel(null);}}
                      generating={generating}/>
                  ))}
                  {gmailMsg&&<div style={{fontSize:12,color:"#007A5A",marginTop:10,padding:"8px 12px",borderRadius:8,background:`${A.aurora}20`,border:`1px solid ${A.aurora}44`}}>{gmailMsg}</div>}
                </div>
                <div>
                  {selItem
                    ?<DetailPanel item={selItem} s2={s2} onSendGmail={()=>sendGmail(sel)} onMarkSent={()=>markSent(sel)}
                        onEditProspect={()=>{setEditIdx(sel);window.scrollTo({top:0,behavior:"smooth"});}}
                        onChange={upd=>uq(q=>q.map((it,i)=>i===sel?upd:it))}/>
                    :<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:200,
                        background:A.white,borderRadius:12,border:`2px dashed ${A.satellite}`,color:A.textMuted,fontSize:14,gap:8}}>
                        <span style={{fontSize:28}}>◎</span>
                        Select a prospect to view their draft
                      </div>}
                </div>
              </div>
            )}
          </>
        )}

        {mainTab==="sent"&&(
          <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:16}}>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:A.textMuted,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.08em"}}>
                Sent · {sentCount}{overdueCount>0&&<span style={{color:A.horizon,marginLeft:8}}>{overdueCount} overdue</span>}
              </div>
              <SentTab queue={queue} onSelect={setSel} selected={sel}/>
            </div>
            <div>
              {selItem&&selItem.status==="sent"
                ?<DetailPanel item={selItem} s2={s2} onSendGmail={()=>sendGmail(sel)} onMarkSent={()=>{}} onEditProspect={()=>{}}
                    onChange={upd=>uq(q=>q.map((it,i)=>i===sel?upd:it))}/>
                :<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:200,
                    background:A.white,borderRadius:12,border:`2px dashed ${A.satellite}`,color:A.textMuted,fontSize:14,gap:8}}>
                    <span style={{fontSize:28}}>◎</span>
                    Select a sent email to view or generate a follow-up
                  </div>}
            </div>
          </div>
        )}

        {mainTab==="rules"&&(
          <div style={{maxWidth:620,background:A.white,borderRadius:12,padding:24,border:`1px solid ${A.satellite}`}}>
            <div style={{fontSize:16,fontWeight:700,color:A.text,marginBottom:4}}>Copy Rules</div>
            <div style={{fontSize:13,color:A.textMuted,marginBottom:20,lineHeight:1.7,padding:"10px 14px",background:A.horizonFaint,borderRadius:8,borderLeft:`3px solid ${A.horizon}`}}>
              These rules are injected into every message Claude drafts. To update them permanently, tell Claude in chat.
            </div>
            <EditableList items={rules} onChange={setRules} placeholder="e.g. Always end with a specific question rather than a generic CTA..."/>
          </div>
        )}

        {mainTab==="research"&&(
          <div style={{maxWidth:620,background:A.white,borderRadius:12,padding:24,border:`1px solid ${A.satellite}`}}>
            <div style={{fontSize:16,fontWeight:700,color:A.text,marginBottom:16}}>Research Areas</div>
            <div style={{fontSize:14,fontWeight:700,color:A.text,marginBottom:4}}>Step 1 — Initial outreach</div>
            <div style={{fontSize:13,color:A.textMuted,marginBottom:14,lineHeight:1.6}}>Context Claude uses when drafting the first email.</div>
            <EditableList items={s1} onChange={setS1} placeholder="e.g. Check job postings for team growth signals..."/>
            <div style={{borderTop:`1px solid ${A.satellite}`,margin:"28px 0 20px"}}/>
            <div style={{fontSize:14,fontWeight:700,color:A.text,marginBottom:4}}>Step 2 — Follow-up research</div>
            <div style={{fontSize:13,color:A.textMuted,marginBottom:14,lineHeight:1.6}}>Sources Claude searches when generating follow-up emails.</div>
            <EditableList items={s2} onChange={setS2} placeholder="e.g. Search for recent conference appearances..."/>
          </div>
        )}
      </div>
    </div>
  );
}
