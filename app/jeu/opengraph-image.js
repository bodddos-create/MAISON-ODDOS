import { ImageResponse } from 'next/og';
export const alt = 'La Machine Gourmande — Jouez et gagnez, 75 cadeaux à La Maison du Parc';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export default function Image() {
  return new ImageResponse(
    <div style={{width:'100%',height:'100%',display:'flex',background:'#f3efe6',padding:'44px 60px',color:'#344131',alignItems:'center',justifyContent:'space-between',fontFamily:'sans-serif'}}>
      <div style={{display:'flex',flexDirection:'column',width:520}}>
        <div style={{fontSize:20,letterSpacing:4,marginBottom:30}}>LA MAISON DU PARC · SALLES</div>
        <div style={{fontSize:64,fontWeight:800,lineHeight:1.06,display:'flex',flexDirection:'column'}}><span>JOUEZ</span><span>ET GAGNEZ !</span></div>
        <div style={{fontSize:30,marginTop:26,color:'#927442'}}>75 cadeaux à gagner</div>
        <div style={{fontSize:22,marginTop:20,lineHeight:1.5}}>3 symboles identiques = 1 cadeau</div>
        <div style={{fontSize:18,marginTop:24}}>JEU GRATUIT · SANS ACHAT · 18 ANS ET +</div>
      </div>
      <div style={{display:'flex',width:465,height:528,position:'relative',alignItems:'center'}}>
        <div style={{display:'flex',flexDirection:'column',width:420,height:500,border:'9px solid #b19a63',borderRadius:36,background:'#283b30',padding:'26px 20px',alignItems:'center',boxShadow:'0 15px 25px #34413140'}}>
          <div style={{fontSize:15,letterSpacing:3,color:'#e5d3a8'}}>LA MAISON DU PARC</div>
          <div style={{display:'flex',flexDirection:'column',fontSize:35,fontWeight:700,color:'#fff5dd',textAlign:'center',marginTop:15,marginBottom:22}}><span>La Machine</span><span>Gourmande</span></div>
          <div style={{display:'flex',background:'#b19a63',padding:9,borderRadius:14,gap:8}}>
            {[0,1,2].map(i=><div key={i} style={{display:'flex',width:100,height:145,background:'#fbf3de',borderRadius:8,flexDirection:'column',alignItems:'center',justifyContent:'center',color:'#344131'}}><span style={{fontSize:13}}>FORMULE</span><span style={{fontSize:58,fontWeight:800}}>29</span><span style={{fontSize:14}}>EUROS</span></div>)}
          </div>
          <div style={{display:'flex',fontSize:16,color:'#fff5dd',marginTop:20}}>TROIS SYMBOLES · UN CADEAU</div>
          <div style={{display:'flex',background:'#b19a63',borderRadius:8,marginTop:24,padding:'13px 28px',fontSize:20,fontWeight:700}}>À VOUS DE JOUER</div>
          <div style={{fontSize:13,letterSpacing:3,color:'#e5d3a8',marginTop:18}}>MAISON ODDOS</div>
        </div>
        <div style={{position:'absolute',right:4,top:198,width:12,height:130,background:'#ad986c',borderRadius:10,display:'flex'}} />
        <div style={{position:'absolute',right:-9,top:172,width:38,height:38,background:'#b19a63',border:'4px solid #344131',borderRadius:30,display:'flex'}} />
      </div>
    </div>, size
  );
}
