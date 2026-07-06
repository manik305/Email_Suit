import os
from PIL import Image

def main():
    # Find the image relative to script location
    script_dir = os.path.dirname(os.path.abspath(__file__))
    img_path = os.path.join(script_dir, "Digio_Her.jpeg")
    
    if not os.path.exists(img_path):
        print(f"Error: {img_path} not found.")
        return
        
    print(f"Loading image from {img_path}...")
    img = Image.open(img_path).convert("RGBA")
    datas = img.getdata()

    new_data = []
    for item in datas:
        r, g, b, a = item
        # If pixel is black/very dark (threshold 35)
        if r < 35 and g < 35 and b < 35:
            new_data.append((r, g, b, 0))
        else:
            # Boost glowing elements (orange and blue parts)
            if r > 200 and g > 100 and b < 100:
                r = min(255, int(r * 1.1))
                g = min(255, int(g * 1.1))
            elif b > 180 and r < 120:
                b = min(255, int(b * 1.15))
                r = min(255, int(r * 0.9))
            new_data.append((r, g, b, a))

    img.putdata(new_data)
    out_path = os.path.join(script_dir, "Digio_Her.png")
    img.save(out_path, "PNG")
    print(f"Successfully saved transparent image to {out_path}")

if __name__ == "__main__":
    main()
