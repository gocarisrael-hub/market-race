"""Recolors the Carmel watercolor map and the food icons into the theme styles, once.

The output is committed (assets/maps/carmel-<style>.webp, assets/icons/<style>/<icon>.webp) and
served as static files: nothing is processed at runtime. Run again only to change a style:

    python3 scripts/themes/process.py            # every style
    python3 scripts/themes/process.py neon gold  # some

Needs numpy and Pillow. The functions are the ones the owner approved in the style showcase.
"""
import numpy as np, sys, os, colorsys
from PIL import Image, ImageFilter
# Repo paths: originals in assets/, processed files written next to them.
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
A=os.path.join(ROOT,'assets')
O=A
def load(p,w=None,crop=0):
    im=Image.open(p).convert('RGBA')
    if crop:
        cw,ch=int(im.width*crop),int(im.height*crop)
        im=im.crop((cw,ch,im.width-cw,im.height-ch))
    if w: im=im.resize((w,int(im.height*w/im.width)),Image.LANCZOS)
    a=np.asarray(im).astype(np.float32)/255
    return a[...,:3],a[...,3]
def hexc(h): h=h.lstrip('#'); return np.array([int(h[i:i+2],16)/255 for i in (0,2,4)],np.float32)
def lum(c): return c[...,0]*.299+c[...,1]*.587+c[...,2]*.114
def sat(c):
    mx=c.max(-1); mn=c.min(-1); return np.where(mx>0,(mx-mn)/np.maximum(mx,1e-4),0)
def ramp(t,stops):
    # stops: list of (pos, hex)
    t=np.clip(t,0,1)[...,None]; out=np.zeros(t.shape[:-1]+(3,),np.float32)
    ps=[s[0] for s in stops]; cs=[hexc(s[1]) for s in stops]
    out[:]=cs[0]
    for i in range(len(stops)-1):
        p0,p1=ps[i],ps[i+1]; m=((t>=p0)&(t<=p1))[...,0]
        k=((t[...,0]-p0)/(p1-p0))[...,None]
        out[m]=(cs[i]*(1-k)+cs[i+1]*k)[m]
    out[(t[...,0]>ps[-1])]=cs[-1]
    return out
def blur(x,r):
    im=Image.fromarray((np.clip(x,0,1)*255).astype(np.uint8)); return np.asarray(im.filter(ImageFilter.GaussianBlur(r))).astype(np.float32)/255
def ink(c):  # line strength from a light-paper illustration
    return np.clip((0.86-lum(c))/0.62,0,1)
def noise(shape,scale=1.0,seed=1):
    rng=np.random.default_rng(seed); n=rng.random(shape).astype(np.float32)
    return n

def neon(c,a=None):
    L=ink(c); S=sat(c)
    h=np.zeros(L.shape,np.float32)
    rgb=c.copy()
    # boosted colour of the art
    mx=np.maximum(c.max(-1,keepdims=True),1e-3)
    vivid=np.clip((c/mx-0.55)*1.35+0.55,0,1)
    cyan=hexc('#57F0FF'); pink=hexc('#FF5AAE')
    # neutral ink lines become cyan, coloured areas keep their own hue at full brightness
    yy=np.linspace(0,1,c.shape[0])[:,None,None]
    base=cyan*(1-yy*0.0)
    r,g,b=c[...,0],c[...,1],c[...,2]
    greenish=((g>r*0.92)&(g>b*1.15)).astype(np.float32)
    greenish=blur(greenish,1.0)[...,None]
    mint=hexc('#5FE3C4')
    fillcol=vivid*(1-greenish)+mint*greenish
    col=np.where((S>0.28)[...,None],fillcol,base)
    fs=np.clip((S-0.25)*1.2,0,1)*(0.42-0.27*greenish[...,0])
    strength=np.maximum(L*0.95,fs)
    if a is not None: strength=strength*a
    em=col*strength[...,None]
    g1=np.stack([blur(em[...,i],3) for i in range(3)],-1)
    g2=np.stack([blur(em[...,i],12) for i in range(3)],-1)
    return em,g1,g2,strength
def save_jpg(rgb,name,q=80):
    Image.fromarray((np.clip(rgb,0,1)*255).astype(np.uint8)).save(os.path.join(O,name),quality=q,optimize=True,progressive=True)
def save_webp(rgb,alpha,name,q=82):
    arr=np.concatenate([np.clip(rgb,0,1),np.clip(alpha,0,1)[...,None]],-1)
    Image.fromarray((arr*255).astype(np.uint8)).save(os.path.join(O,name),quality=q,method=6)

MAPW=780
maps={'carmel':('maps/carmel-watercolor.jpg',0.0),'mj':('maps/mahane-yehuda-watercolor.jpg',0.07),'riso':('maps/carmel-riso.jpg',0.05),'night':('maps/mahane-yehuda-night.jpg',0.035)}
ICONS=['fruit','tomatoes','gate','falafel','hummus','coffee','spices','flowers']

def T_neon(c,a=None,bg='#100C22'):
    em,g1,g2,s=neon(c,a)
    if a is None:
        b=np.ones_like(c)*hexc(bg)
        out=b+em*0.95+g1*0.9+g2*1.1
        return out,None
    glow=np.clip(lum(g1)*2.2+lum(g2)*2.5,0,1)
    alpha=np.clip(np.maximum(s,glow),0,1)
    rgb=(em+g1*0.9+g2*1.1)/np.maximum(alpha[...,None],1e-3)
    return np.clip(rgb,0,1),alpha
def T_blush(c,a=None):
    l=lum(c)
    out=ramp(l,[(0,'#4E1430'),(0.45,'#B84A72'),(0.75,'#EBA9BC'),(0.92,'#FBE5E9'),(1,'#FFF4F3')])
    S=sat(c)[...,None]
    out=out*(1-0.18*S)+c*0.18*S
    return out,a
def T_ink(c,a=None,seed=3):
    l=lum(c); S=sat(c); r,g,b=c[...,0],c[...,1],c[...,2]
    out=ramp(l,[(0,'#17130F'),(0.5,'#5E4630'),(0.8,'#C3A57C'),(1,'#DCC39C')])
    hue=np.zeros_like(l)
    redish=((r>g*1.25)&(r>b*1.3)&(S>0.35)).astype(np.float32)
    redish=blur(redish,1.2)
    red=hexc('#A2302A')*np.clip(0.6+l*0.6,0,1)[...,None]
    out=out*(1-redish[...,None])+red*redish[...,None]
    if a is None:
        n=noise(l.shape,seed=seed); fib=blur(n,0.8)
        out=out*(0.92+0.1*fib[...,None])
    return out,a
def T_gold(c,a=None,bg='#F7F0E2'):
    L=np.clip(ink(c)*1.15,0,1)**0.8; S=sat(c)
    h,w=L.shape
    yy,xx=np.mgrid[0:h,0:w].astype(np.float32)
    t=(np.sin((xx+yy)/w*7.0)*0.5+0.5)*0.6+blur(noise((h,w),seed=5),2)*0.4
    gold=ramp(t,[(0,'#8E6420'),(0.35,'#C59A45'),(0.55,'#EBD08C'),(0.75,'#B8893A'),(1,'#7E5818')])
    wash=np.clip((S-0.2)*0.5,0,0.35)
    if a is None:
        b=np.ones_like(c)*hexc(bg)
        k=np.clip(L+wash,0,1)[...,None]
        return b*(1-k)+gold*k,None
    k=np.clip(L+wash,0,1)[...,None]
    ivory=np.ones_like(c)*hexc('#FFFAF0')
    return ivory*(1-k)+gold*k,a
def T_cobalt(c,a=None):
    l=lum(c)
    out=ramp(l,[(0,'#0B1F55'),(0.45,'#1F4FB0'),(0.75,'#8FAEE0'),(0.9,'#E6EDF8'),(1,'#FBF9F4')])
    return out,a
THEMES={'neon':T_neon,'blush':T_blush,'ink':T_ink,'gold':T_gold,'cobalt':T_cobalt}


# The icons the player draws (STOP_ICONS in src/web/player/logic.ts).
APP_ICONS=['fruit','tomatoes','falafel','hummus','coffee','spices','flowers']

def save_map(rgb,name,q=80):
    Image.fromarray((np.clip(rgb,0,1)*255).astype(np.uint8)).save(os.path.join(O,'maps',name),'WEBP',quality=q,method=6)

if __name__=='__main__':
    which=sys.argv[1:] or list(THEMES)
    c,a=load(os.path.join(A,maps['carmel'][0]),MAPW,0)
    for t in which:
        f=THEMES[t]
        out,_=f(c)
        save_map(out,f'carmel-{t}.webp')
        os.makedirs(os.path.join(O,'icons',t),exist_ok=True)
        for ic in APP_ICONS:
            ci,ai=load(os.path.join(A,'icons',ic+'.png'),None)
            if t=='neon':
                # pad so the glow has room
                pad=24; H,W=ai.shape
                cc=np.ones((H+2*pad,W+2*pad,3),np.float32); aa=np.zeros((H+2*pad,W+2*pad),np.float32)
                cc[pad:-pad,pad:-pad]=ci*ai[...,None]+(1-ai[...,None]); aa[pad:-pad,pad:-pad]=ai
                o,al=T_neon(cc,aa)
            else:
                o,al=f(ci,ai)
            save_webp(o,al,os.path.join('icons',t,ic+'.webp'),82)
        print(t,'ok')
