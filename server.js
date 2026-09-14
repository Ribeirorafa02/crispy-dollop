const express = require("express");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json({limit:"2mb"}));
app.use(express.urlencoded({extended:true}));

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "verdeja-dev-secret-change-me";
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

function emptyDB(){ return {
  users: [], products: [], orders: [], deliveries: [],
  settings: { commission: 10, freeShippingMin: 30, maxShipping: 10 },
  counters: { user: 1, product: 1, order: 1, delivery: 1 }
};}
function loadDB(){
  fs.mkdirSync(DATA_DIR,{recursive:true});
  if(!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(emptyDB(),null,2));
  return JSON.parse(fs.readFileSync(DB_FILE,"utf8"));
}
let db = loadDB();
function save(){ fs.writeFileSync(DB_FILE, JSON.stringify(db,null,2)); }
function id(prefix,key){ const n=db.counters[key]++; return prefix+n; }
function cleanUser(u){ const {passwordHash,...x}=u; return x; }
function auth(req,res,next){
  const h=req.headers.authorization||"";
  if(!h.startsWith("Bearer ")) return res.status(401).json({error:"Não autenticado"});
  try{
    const p=jwt.verify(h.slice(7),JWT_SECRET);
    const u=db.users.find(x=>x.id===p.id);
    if(!u || u.status==="blocked") return res.status(401).json({error:"Conta indisponível"});
    req.user=u; next();
  }catch(e){ return res.status(401).json({error:"Sessão inválida"}); }
}
function role(...roles){ return (req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({error:"Sem permissão"}); }
function money(n){ return Math.round(Number(n)*100)/100; }

if(!db.users.some(u=>u.role==="admin")){
  const email=process.env.ADMIN_EMAIL||"admin@verdeja.com.br";
  const password=process.env.ADMIN_PASSWORD||"admin123";
  db.users.push({id:id("u_", "user"), name:"Administrador", email, phone:"", city:"", state:"", role:"admin", status:"active", passwordHash:bcrypt.hashSync(password,10), createdAt:new Date().toISOString()});
  save();
}

app.get("/api/health",(req,res)=>res.json({ok:true,app:"VerdeJá",version:"1.0.0"}));

app.post("/api/auth/register",(req,res)=>{
  const {name,email,password,phone,city,state,role:requestedRole}=req.body;
  if(!name||!email||!password||!city||!state) return res.status(400).json({error:"Preencha nome, e-mail, senha, cidade e estado."});
  if(password.length<6) return res.status(400).json({error:"A senha precisa ter pelo menos 6 caracteres."});
  if(db.users.some(u=>u.email.toLowerCase()===email.toLowerCase())) return res.status(409).json({error:"E-mail já cadastrado."});
  const r=["customer","seller","courier"].includes(requestedRole)?requestedRole:"customer";
  const status=r==="customer"?"active":"pending";
  const u={id:id("u_","user"),name,email:email.toLowerCase(),phone:phone||"",city,state:state.toUpperCase(),role:r,status,passwordHash:bcrypt.hashSync(password,10),createdAt:new Date().toISOString(),
    paymentMethods:r==="seller"?{pix:true,creditCard:true,debitCard:true}:undefined,
    payout:r==="seller"?{type:"pix",pixKey:"",bank:"",agency:"",account:"",holderName:name,document:""}:undefined
  };
  db.users.push(u); save();
  if(status==="pending") return res.json({message:"Cadastro enviado para aprovação.",pending:true});
  const token=jwt.sign({id:u.id},JWT_SECRET,{expiresIn:"7d"});
  res.json({token,user:cleanUser(u)});
});

app.post("/api/auth/login",(req,res)=>{
  const {email,password}=req.body;
  const u=db.users.find(x=>x.email===String(email||"").toLowerCase());
  if(!u||!bcrypt.compareSync(password||"",u.passwordHash)) return res.status(401).json({error:"E-mail ou senha inválidos."});
  if(u.status==="pending") return res.status(403).json({error:"Seu cadastro ainda aguarda aprovação."});
  if(u.status==="blocked") return res.status(403).json({error:"Conta bloqueada."});
  const token=jwt.sign({id:u.id},JWT_SECRET,{expiresIn:"7d"});
  res.json({token,user:cleanUser(u)});
});

app.get("/api/me",auth,(req,res)=>res.json(cleanUser(req.user)));

app.get("/api/settings",(req,res)=>res.json(db.settings));

app.get("/api/products",(req,res)=>{
  const q=String(req.query.q||"").toLowerCase();
  const city=String(req.query.city||"").toLowerCase();
  let list=db.products.filter(p=>p.active!==false&&p.stock>0);
  if(q) list=list.filter(p=>(p.name+" "+p.description).toLowerCase().includes(q));
  if(city) list=list.filter(p=>!p.city || p.city.toLowerCase()===city);
  res.json(list);
});

app.post("/api/products",auth,role("seller"),(req,res)=>{
  const {name,description,price,unit,stock,city,image}=req.body;
  if(!name||Number(price)<=0||Number(stock)<0) return res.status(400).json({error:"Nome, preço e estoque são obrigatórios."});
  const p={id:id("p_","product"),sellerId:req.user.id,sellerName:req.user.name,name,description:description||"",price:money(price),unit:unit||"unidade",stock:Number(stock),city:city||req.user.city,image:image||"",active:true,createdAt:new Date().toISOString()};
  db.products.push(p); save(); res.json(p);
});

app.patch("/api/products/:id",auth,role("seller","admin"),(req,res)=>{
  const p=db.products.find(x=>x.id===req.params.id);
  if(!p) return res.status(404).json({error:"Produto não encontrado"});
  if(req.user.role==="seller"&&p.sellerId!==req.user.id) return res.status(403).json({error:"Sem permissão"});
  Object.assign(p, req.body);
  if(p.price!==undefined) p.price=money(p.price);
  save(); res.json(p);
});

app.get("/api/seller/products",auth,role("seller"),(req,res)=>res.json(db.products.filter(p=>p.sellerId===req.user.id)));

app.put("/api/seller/payment-settings",auth,role("seller"),(req,res)=>{
  const allowed=["pix","creditCard","debitCard"];
  const methods={};
  allowed.forEach(k=>methods[k]=!!req.body[k]);
  if(!Object.values(methods).some(Boolean)) return res.status(400).json({error:"Selecione pelo menos uma forma de pagamento."});
  req.user.paymentMethods=methods;
  save(); res.json(req.user.paymentMethods);
});

app.put("/api/seller/payout",auth,role("seller"),(req,res)=>{
  const {type,pixKey,bank,agency,account,holderName,document}=req.body;
  req.user.payout={type:type==="bank"?"bank":"pix",pixKey:pixKey||"",bank:bank||"",agency:agency||"",account:account||"",holderName:holderName||req.user.name,document:document||""};
  save(); res.json({ok:true,payout:req.user.payout});
});

app.get("/api/seller/summary",auth,role("seller"),(req,res)=>{
  const orders=db.orders.filter(o=>o.items.some(i=>i.sellerId===req.user.id));
  let gross=0, platform=0, net=0;
  orders.forEach(o=>o.items.filter(i=>i.sellerId===req.user.id).forEach(i=>{gross+=i.subtotal;platform+=i.subtotal*(db.settings.commission/100);net+=i.subtotal*(1-db.settings.commission/100)}));
  res.json({orders:orders.length,gross:money(gross),platform:money(platform),net:money(net),paymentMethods:req.user.paymentMethods,payout:req.user.payout});
});

app.post("/api/orders",auth,role("customer"),(req,res)=>{
  const {items,address,paymentMethod}=req.body;
  if(!Array.isArray(items)||!items.length) return res.status(400).json({error:"Carrinho vazio."});
  if(!address||!address.city) return res.status(400).json({error:"Informe a cidade e endereço de entrega."});
  const valid=[];
  for(const it of items){
    const p=db.products.find(x=>x.id===it.productId&&x.active!==false);
    const qty=Number(it.qty);
    if(!p||qty<=0||p.stock<qty) return res.status(400).json({error:`Estoque insuficiente para ${p?.name||"produto"}.`});
    const seller=db.users.find(u=>u.id===p.sellerId);
    if(!seller||seller.status!=="active") return res.status(400).json({error:"Vendedor indisponível."});
    if(!seller.paymentMethods?.[paymentMethod]) return res.status(400).json({error:`O vendedor ${seller.name} não aceita ${paymentMethod}.`});
    valid.push({productId:p.id,sellerId:p.sellerId,name:p.name,qty,unit:p.unit,price:p.price,subtotal:money(p.price*qty)});
  }
  const subtotal=money(valid.reduce((s,i)=>s+i.subtotal,0));
  const shipping=subtotal>=db.settings.freeShippingMin?0:money(Math.min(db.settings.maxShipping, Math.max(0, 3 + (address.distanceKm||0)*0.8)));
  const total=money(subtotal+shipping);
  valid.forEach(i=>db.products.find(p=>p.id===i.productId).stock-=i.qty);
  const o={id:id("o_","order"),customerId:req.user.id,customerName:req.user.name,items:valid,address,paymentMethod,subtotal,shipping,total,status:"confirmed",createdAt:new Date().toISOString(),paymentStatus:paymentMethod==="pix"?"pending":"pending"};
  db.orders.push(o); save(); res.json(o);
});

app.get("/api/orders",auth,(req,res)=>{
  let list=req.user.role==="customer"?db.orders.filter(o=>o.customerId===req.user.id):db.orders;
  if(req.user.role==="seller") list=list.filter(o=>o.items.some(i=>i.sellerId===req.user.id));
  res.json(list.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));
});

app.patch("/api/orders/:id/status",auth,(req,res)=>{
  const o=db.orders.find(x=>x.id===req.params.id);
  if(!o) return res.status(404).json({error:"Pedido não encontrado"});
  const s=req.body.status;
  const allowed=["confirmed","preparing","ready","picked_up","in_transit","delivered","cancelled"];
  if(!allowed.includes(s)) return res.status(400).json({error:"Status inválido"});
  const canAdmin=req.user.role==="admin";
  const canSeller=req.user.role==="seller" && o.items.some(i=>i.sellerId===req.user.id);
  const canCourier=req.user.role==="courier" && o.courierId===req.user.id;
  const canCustomer=req.user.role==="customer" && o.customerId===req.user.id && s==="cancelled";
  if(!(canAdmin||canSeller||canCourier||canCustomer)) return res.status(403).json({error:"Sem permissão"});
  o.status=s;
  if(s==="delivered") o.deliveredAt=new Date().toISOString();
  save(); res.json(o);
});

app.get("/api/courier/available",auth,role("courier"),(req,res)=>{
  res.json(db.orders.filter(o=>["ready","confirmed"].includes(o.status)&&!o.courierId).map(o=>({...o,deliveryFee:o.shipping})));
});
app.post("/api/courier/orders/:id/accept",auth,role("courier"),(req,res)=>{
  const o=db.orders.find(x=>x.id===req.params.id);
  if(!o||o.courierId||!["ready","confirmed"].includes(o.status)) return res.status(400).json({error:"Entrega não disponível."});
  o.courierId=req.user.id;o.courierName=req.user.name;o.status="picked_up";save();res.json(o);
});

app.get("/api/admin/users",auth,role("admin"),(req,res)=>res.json(db.users.map(cleanUser)));
app.patch("/api/admin/users/:id",auth,role("admin"),(req,res)=>{
  const u=db.users.find(x=>x.id===req.params.id);
  if(!u) return res.status(404).json({error:"Usuário não encontrado"});
  if(["active","blocked","pending"].includes(req.body.status)) u.status=req.body.status;
  save();res.json(cleanUser(u));
});
app.get("/api/admin/summary",auth,role("admin"),(req,res)=>{
  const revenue=money(db.orders.filter(o=>o.status!=="cancelled").reduce((s,o)=>s+o.subtotal*(db.settings.commission/100),0));
  res.json({users:db.users.length,sellers:db.users.filter(u=>u.role==="seller").length,couriers:db.users.filter(u=>u.role==="courier").length,customers:db.users.filter(u=>u.role==="customer").length,orders:db.orders.length,platformRevenue:revenue,settings:db.settings});
});
app.put("/api/admin/settings",auth,role("admin"),(req,res)=>{
  const commission=Number(req.body.commission), freeShippingMin=Number(req.body.freeShippingMin), maxShipping=Number(req.body.maxShipping);
  if(commission<0||commission>100||freeShippingMin<0||maxShipping<0) return res.status(400).json({error:"Valores inválidos"});
  db.settings={commission,freeShippingMin,maxShipping};save();res.json(db.settings);
});

app.use(express.static(path.join(__dirname,"public")));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`VerdeJá rodando na porta ${PORT}`));
