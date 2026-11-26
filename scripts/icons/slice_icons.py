"""Slice the hand-drawn icon sheets into transparent PNG + WebP icons.

    python3 scripts/icons/slice_icons.py <dir with sheet-1.png..sheet-32.png> assets/icons [sheet-3,sheet-8]

The sheets are not in the repo (the owner keeps them). Only the WebP output is committed; the PNGs
are git-ignored. After adding names here, run `node scripts/icons/manifest.ts` to refresh the manifest.
Needs numpy, scipy and Pillow."""
import sys, os, re
import numpy as np
from PIL import Image
from scipy import ndimage

SHEETS = {
 "sheet-1": (4, ["shawarma","sabich","falafel-cone","shakshuka","burekas","jachnun","malawach","kaak-bagel",
                 "kubbeh-soup","skewers","corn","pita-stack","tahini","amba","chickpeas","pickled-veg"]),
 "sheet-2": (4, ["baklava","halva","knafeh","rugelach","sufganiya","malabi","babka","ice-pop",
                 "orange-juice","pomegranate-juice","lemonade","turkish-coffee","mint-tea","arak","beer","sahlab"]),
 "sheet-3": (4, ["watermelon","grapes","dates","figs","avocado","bananas","lemons","strawberries",
                 "cucumbers","eggplant","peppers","onion-garlic","carrots","mango","cherries","olives"]),
 "sheet-4": (4, ["challah","cheese","labneh","fish","eggs","zaatar","nuts-sacks","dried-fruit",
                 "honey","olive-oil","pickles","tea-leaves","candy-jar","wine","coffee-beans","chili-string"]),
 "sheet-5": (4, ["fruit-crate","scale","wicker-basket","grocery-bag","shopping-trolley","market-lamp","treasure-map","map-pin",
                 "compass","magnifier","hourglass","stopwatch","camera","phone-puzzle","idea-bulb","question-bubble"]),
 "sheet-6": (4, ["trophy","medal","star","finish-flag","sneakers","sealed-envelope","key","padlock",
                 "gift","ticket","fork-knife","chef-hat","heart","speech-bubble","footprints","signpost"]),
 "sheet-7": (2, ["party-popper","dice","puzzle-piece","route"]),
 "sheet-8": (4, ["schnitzel-baguette","jerusalem-grill","arayes","kebab-plate","khachapuri","lahmajoun","sambusak","roasted-cauliflower",
                 "latkes","pizza-slice","fries","ciabatta","cheese-toast","mafrum","chicken-wings","fried-fish"]),
 "sheet-9": (4, ["tabbouleh","israeli-salad","matbucha","baba-ghanoush","schug","roasted-peppers","beet-salad","carrot-salad",
                 "fattoush","grape-leaves","stuffed-peppers","majadra","couscous-veg","tomato-onion","tzatziki","coleslaw"]),
 "sheet-10": (4, ["croissant","chocolate-croissant","cinnamon-roll","cheese-danish","sourdough","baguette","bagel-cream-cheese","muffin",
                  "cheesecake","poppy-cake","olive-bread","pretzel","avocado-toast","granola","pancakes","waffle"]),
 "sheet-11": (4, ["chocolate-cake","chocolate-balls","macarons","tahini-cookies","maamoul","ice-cream-cone","soft-serve","sorbet",
                  "chocolate-bar","cupcake","meringues","marshmallow-dome","tiramisu","fruit-tart","turkish-delight","qatayef"]),
 "sheet-12": (4, ["espresso","cappuccino","iced-coffee","limonana-slush","carrot-juice","smoothie","water-lemon","sparkling-water",
                  "cola","white-wine","cocktail","milkshake","hot-chocolate","tamarind-drink","milk-bottle","coconut-drink"]),
 "sheet-13": (4, ["clementines","apples","pears","peaches","plums","apricots","kiwi","pineapple",
                  "papaya","persimmons","passion-fruit","lychees","prickly-pear","guava","loquats","blueberries"]),
 "sheet-14": (4, ["potatoes","sweet-potatoes","cabbage","cauliflower","broccoli","zucchini","artichoke","beets",
                  "radishes","lettuce","leeks","mushrooms","green-beans","okra","kohlrabi","pumpkin"]),
 "sheet-15": (4, ["parsley","cilantro","mint","basil","rosemary","dill","bay-leaves","cinnamon-sticks",
                  "star-anise","cardamom","cloves","saffron","sumac","turmeric","pepper-mill","salt"]),
 "sheet-16": (4, ["steak","whole-chicken","lamb-chops","sausages","salami","pastrami","meatballs","shrimp",
                  "calamari","salmon","sardines","mussels","crab","kebab-skewer","smoked-fish","fried-egg"]),
 "sheet-17": (4, ["yogurt","butter","milk-carton","feta-jar","goat-cheese","yellow-cheese","cottage-cheese","cream-cheese",
                  "rice-sack","red-lentils","flour-sack","sugar-bowl","pasta","bulgur","couscous-jar","tomato-can"]),
 "sheet-18": (4, ["kubaneh","tagine","chraime","injera","jeweled-rice","khinkali","matzah-ball-soup","gefilte-fish",
                  "chopped-liver","cholent","kugel","plov","brik","kurdish-kubbeh","gozleme","manoushe"]),
 "sheet-19": (4, ["peanut-puffs","pretzel-sticks","popcorn","sunflower-seeds","pistachios","gummy-bears","lollipop","wafer-bar",
                  "chewing-gum","cotton-candy","candy-apple","chestnuts","pita-chips","chocolate-spread","marshmallows","rice-cakes"]),
 "sheet-20": (4, ["apple-honey","shofar","sukkah","lulav-etrog","hanukkiah","dreidel","chocolate-coins","hamantaschen",
                  "mishloach-manot","gragger","matzah","seder-plate","kiddush-cup","blintzes","carob","bonfire"]),
 "sheet-21": (4, ["market-cart","market-umbrella","cash-register","coin-purse","coins","banknotes","price-tag","chalkboard-sign",
                  "produce-crates","tomato-box","spice-scoop","cutting-board","tongs","nut-bag","garlic-braid","burlap-sack"]),
 "sheet-22": (4, ["clock-tower","lighthouse","bauhaus-building","kiosk","skyscrapers","stone-house","market-hall","bus-stop",
                  "street-lamp","traffic-light","park-bench","water-fountain","bicycle","e-scooter","mailbox","street-sign"]),
 "sheet-23": (4, ["palm-tree","olive-tree","bougainvillea","ficus-tree","cactus","sunflower","wave","sailboat",
                  "beach-umbrella","matkot","seashell","flip-flops","sun","moon","cloud","rainbow"]),
 "sheet-24": (4, ["cat","pigeon","seagull","dog","hoopoe","parrot","butterfly","bee",
                  "ladybug","goldfish","camel","donkey","turtle","hedgehog","owl","rooster"]),
 "sheet-25": (4, ["check","cross","plus","lightning","fire","crown","diamond","star-coin",
                  "treasure-chest","ribbon-scroll","bell","megaphone","alarm-clock","calendar","notepad","pencil"]),
 "sheet-26": (4, ["arrow-right","arrow-curved","refresh","target","pennant","bookmark","magnet","rocket",
                  "balloon","kite","shield","binoculars","telescope","lantern","flashlight","planet"]),
 "sheet-27": (4, ["smartphone","headphones","speaker","music-notes","play","pause","home","settings",
                  "paper-plane","link","qr-code","wifi","battery","open-envelope","photo-print","picture-frame"]),
 "sheet-28": (4, ["face-happy","face-laughing","face-surprised","face-thinking","face-heart-eyes","face-yummy","thumbs-up","clapping",
                  "high-five","waving-hand","peace-hand","ok-hand","rosette","sparkles","fireworks","wrapped-candy"]),
 "sheet-29": (4, ["bus","taxi","train","golf-cart","electric-car","vespa","airplane","hot-air-balloon",
                  "suitcase","backpack","folded-map","sunglasses","sun-hat","water-bottle","tent","ferry"]),
 "sheet-30": (4, ["guitar","darbuka","oud","tambourine","microphone","vinyl","book","newspaper",
                  "backgammon","playing-cards","chess-knight","soccer-ball","basketball","frisbee","yo-yo","skateboard"]),
 "sheet-31": (4, ["rose","tulip","anemone","cyclamen","lavender","jasmine","daisy","orchid",
                  "succulent","herb-pots","almond-blossom","pomegranate-flower","lily","hibiscus","fern","bouquet"]),
 "sheet-32": (4, ["walnuts","almonds","cashews","peanuts","hazelnuts","pumpkin-seeds","pecans","coconut",
                  "sugar-cane","honeycomb","sesame","dried-hibiscus","rose-buds","black-lemons","vanilla","dried-chickpeas"]),
}

# category folder per sheet; a list gives one category per 8-icon half
CATEGORY = {
 "sheet-1":"food", "sheet-2":["sweets","drinks"], "sheet-3":"produce", "sheet-4":"pantry",
 "sheet-5":"market:6", "sheet-6":"game", "sheet-7":"game", "sheet-8":"food", "sheet-9":"food",
 "sheet-10":"bakery", "sheet-11":"sweets", "sheet-12":"drinks", "sheet-13":"produce", "sheet-14":"produce",
 "sheet-15":"herbs-spices", "sheet-16":"meat-fish", "sheet-17":"pantry", "sheet-18":"food", "sheet-19":"snacks",
 "sheet-20":"holidays", "sheet-21":"market", "sheet-22":"city", "sheet-23":"nature", "sheet-24":"animals",
 "sheet-25":"game", "sheet-26":"game", "sheet-27":"ui", "sheet-28":"reactions", "sheet-29":"travel",
 "sheet-30":"fun", "sheet-31":"nature", "sheet-32":"pantry",
}

def category(sheet, i):
    c = CATEGORY[sheet]
    if isinstance(c, list):
        return c[i // 8]
    if c == "market:6":
        return "market" if i < 6 else "game"
    return c

MARGIN = 56  # drawings overflow their grid cell; look this far past it

def cut(im, box):
    """Cut one icon. The window is the grid cell grown by MARGIN, so a bottle cap or a stick that
    crosses the cell line is kept; blobs whose centre lies outside the cell belong to a neighbour."""
    W, H = im.size
    x0c, y0c = max(box[0] - MARGIN, 0), max(box[1] - MARGIN, 0)
    x1c, y1c = min(box[2] + MARGIN, W), min(box[3] + MARGIN, H)
    a = np.asarray(im.crop((x0c, y0c, x1c, y1c))).astype(np.int16)
    mn, mx = a.min(2), a.max(2)
    nearwhite = (mn > 228) & ((mx - mn) < 22)
    lab, _ = ndimage.label(nearwhite)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    fg = ~np.isin(lab, border[border > 0])
    fg = ndimage.binary_opening(fg, iterations=1)          # drop paper-grain specks
    # group strokes that belong together (sparkles, confetti, footprints) before judging ownership
    groups, ng = ndimage.label(ndimage.binary_dilation(fg, iterations=4))
    cx0, cy0, cx1, cy1 = box[0] - x0c, box[1] - y0c, box[2] - x0c, box[3] - y0c
    keep = np.zeros_like(fg)
    for g in range(1, ng + 1):
        m = fg & (groups == g)
        n = m.sum()
        if n < 25:
            continue
        ys, xs = np.nonzero(m)
        cy, cx = ys.mean(), xs.mean()
        if cx0 <= cx < cx1 and cy0 <= cy < cy1:
            keep |= m
    fg = keep
    alpha = ndimage.gaussian_filter(fg.astype(float), 0.7)
    alpha = (np.clip(alpha * 1.4, 0, 1) * 255).astype(np.uint8)
    rgba = np.dstack([a.astype(np.uint8), alpha])
    ys, xs = np.where(alpha > 10)
    if not len(ys):
        return None
    pad = 6
    y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad, a.shape[0])
    x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad, a.shape[1])
    return Image.fromarray(rgba[y0:y1, x0:x1], "RGBA")

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
done = 0
only = set(sys.argv[3].split(",")) if len(sys.argv) > 3 else None
for sheet, (n, names) in SHEETS.items():
    if only and sheet not in only:
        continue
    p = next((os.path.join(src, f) for f in os.listdir(src)
              if f.lower().endswith(".png") and re.fullmatch(re.escape(sheet) + r"(@\dx)?( \(\d+\))?", f[:-4].lower())), None)
    if not p:
        print("missing", sheet); continue
    src_im = Image.open(p).convert("RGBA")
    im = Image.new("RGBA", src_im.size, (255, 255, 255, 255))
    im.alpha_composite(src_im)
    im = im.convert("RGB")
    W, H = im.size
    for i, name in enumerate(names):
        r, c = divmod(i, n)
        box = (c * W // n, r * H // n, (c + 1) * W // n, (r + 1) * H // n)
        icon = cut(im, box)
        if icon is None:
            print("empty", sheet, name); continue
        d = os.path.join(out, category(sheet, i))
        os.makedirs(d, exist_ok=True)
        icon.save(os.path.join(d, name + ".png"), optimize=True)
        icon.save(os.path.join(d, name + ".webp"), "WEBP", quality=88, method=4)
        done += 1
print("icons written:", done)
