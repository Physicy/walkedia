"""Réduit les anneaux du halo sur walkedia-logo-V3.svg, sans rien toucher d'autre.

Seuls les deux cercles cyan sont affectés : les traits, le point d'intersection,
le cadrage et les couleurs restent identiques au fichier d'origine.
"""
import re

SRC = "base.svg"
R_OUT, R_IN = 145.45, 80.96        # rayons d'origine
CX, CY = 159.03, 184.32
CYAN = "#22D3EE"

src = open(SRC, encoding="utf-8").read().replace("\r\n", "\n")


def rescale(k, stroke_k=None):
    """k = facteur sur les rayons. stroke_k : facteur sur l'épaisseur des anneaux."""
    sk = k ** 0.45 if stroke_k is None else stroke_k
    out = src
    for r, sw in ((R_OUT, 4.94), (R_IN, 3.38)):
        out = out.replace(f'r="{r}" fill="none" stroke="{CYAN}" stroke-width="{sw}"',
                          f'r="{r*k:.2f}" fill="none" stroke="{CYAN}" stroke-width="{sw*sk:.2f}"')
    return out


def animated(k):
    """Version animée (anneau en pointillés rotatifs + onde sonar) sur le halo réduit."""
    ro, ri = R_OUT * k, R_IN * k
    sk = k ** 0.45
    body = rescale(k)
    dash = (f'<circle cx="{CX}" cy="{CY}" r="{ro:.2f}" fill="none" stroke="{CYAN}"'
            f' stroke-width="{2.2*5.06*sk/4.94:.2f}" stroke-opacity="0.9"'
            f' stroke-dasharray="{5.1*sk:.1f} {16*sk:.1f}" stroke-linecap="round">'
            f'<animateTransform attributeName="transform" type="rotate"'
            f' from="0 {CX} {CY}" to="360 {CX} {CY}" dur="9s" repeatCount="indefinite"/></circle>')
    wave = (f'<circle cx="{CX}" cy="{CY}" r="{ri:.2f}" fill="none" stroke="{CYAN}"'
            f' stroke-width="{4.94*sk:.2f}" stroke-opacity="0.85">'
            f'<animate attributeName="r" values="{ri*0.55:.2f};{ro*1.22:.2f}" dur="3.2s"'
            f' repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines="0.25 0.6 0.3 1"/>'
            f'<animate attributeName="stroke-opacity" values="0.9;0" dur="3.2s" repeatCount="indefinite"/>'
            f'<animate attributeName="stroke-width" values="{4.94*sk:.2f};1.8" dur="3.2s" repeatCount="indefinite"/>'
            f'</circle>')
    # l'anneau extérieur statique devient l'anneau pointillé
    body = re.sub(r'<circle cx="159.03" cy="184.32" r="%.2f"[^>]*stroke-opacity="0.85">\s*</circle>' % ro,
                  dash, body)
    # l'onde s'insère juste avant le point central
    body = body.replace(f'<circle cx="{CX}" cy="{CY}" r="22.12"', wave + f'\n    <circle cx="{CX}" cy="{CY}" r="22.12"')
    return body


if __name__ == "__main__":
    for k in (0.85, 0.75, 0.65):
        open(f"halo-{int(k*100)}.svg", "w", encoding="utf-8").write(rescale(k))
        open(f"halo-{int(k*100)}-anime.svg", "w", encoding="utf-8").write(animated(k))
    print("variantes statiques + animées : 85 %, 75 %, 65 %")


# --- variante « clignotement » -------------------------------------------
def flicker_anim(base, dur, indent="      "):
    """Battement d'opacité irrégulier sur un anneau."""
    lo, hi = round(max(0.05, base - 0.45), 2), round(min(1.0, base + 0.15), 2)
    vals = f"{base};{lo};{hi};{round(base*0.7,2)};{hi};{lo};{base}"
    sp = ";".join(["0.4 0 0.6 1"] * 6)
    return (f'\n{indent}<animate attributeName="stroke-opacity" values="{vals}"'
            f' keyTimes="0;0.17;0.31;0.48;0.63;0.82;1" dur="{dur}"'
            f' repeatCount="indefinite" calcMode="spline" keySplines="{sp}"/>\n{indent[:-2]}')


def blinking(k, with_wave=False):
    """Les deux anneaux clignotent, désynchronisés. Option : onde sonar en plus."""
    ro, ri = R_OUT * k, R_IN * k
    sk = k ** 0.45
    out = rescale(k)
    out = out.replace(f'stroke-width="{4.94*sk:.2f}" stroke-opacity="0.85">',
                      f'stroke-width="{4.94*sk:.2f}" stroke-opacity="0.85">'
                      + flicker_anim(0.85, "2.3s"))
    out = out.replace(f'stroke-width="{3.38*sk:.2f}" stroke-opacity="0.55">',
                      f'stroke-width="{3.38*sk:.2f}" stroke-opacity="0.55">'
                      + flicker_anim(0.55, "3.1s"))
    # battement du point d'intersection
    out = out.replace(f'<circle cx="{CX}" cy="{CY}" r="22.12" fill="#9C90FF"/>',
                      f'<circle cx="{CX}" cy="{CY}" r="22.12" fill="#9C90FF">\n'
                      f'      <animate attributeName="r" values="22.12;26.98;22.12" dur="3.2s"'
                      f' repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1"'
                      f' keySplines="0.4 0 0.2 1;0.4 0 0.2 1"/>\n    </circle>')
    if with_wave:
        wave = (f'<circle cx="{CX}" cy="{CY}" r="{ri:.2f}" fill="none" stroke="{CYAN}"'
                f' stroke-width="{4.94*sk:.2f}" stroke-opacity="0.85">'
                f'<animate attributeName="r" values="{ri*0.55:.2f};{ro*1.22:.2f}" dur="3.2s"'
                f' repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines="0.25 0.6 0.3 1"/>'
                f'<animate attributeName="stroke-opacity" values="0.9;0" dur="3.2s" repeatCount="indefinite"/>'
                f'<animate attributeName="stroke-width" values="{4.94*sk:.2f};1.8" dur="3.2s" repeatCount="indefinite"/>'
                f'</circle>\n    ')
        out = out.replace(f'<circle cx="{CX}" cy="{CY}" r="22.12"', wave + f'<circle cx="{CX}" cy="{CY}" r="22.12"')
    return out


for k in (0.85, 0.75, 0.65):
    p = int(k * 100)
    open(f"halo-{p}-clignotement.svg", "w", encoding="utf-8").write(blinking(k))
    open(f"halo-{p}-clignotement-onde.svg", "w", encoding="utf-8").write(blinking(k, with_wave=True))
print("variantes clignotement écrites")
