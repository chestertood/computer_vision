"""Vehicle detection on full frame (no lane crop, no tracking yet)."""
import cv2
from ultralytics import YOLO
import numpy as np
import torch

VIDEO = "./src/131232-749706873_medium.mp4"
OUTPUT = "output_detect.mp4"
VEHICLE_CLASSES = [1, 2, 3, 5, 7]  # bicycle, car, motorcycle, bus, truck

def crop_frame(frame, x1, y1, x2, y2):
    cap = cv2.VideoCapture(VIDEO)
    fps = cap.get(cv2.CAP_PROP_FPS)
    x1, y1, x2, y2 = 0, 900, 720, 1280   # พิกัดที่ต้องการ
    writer = cv2.VideoWriter("clip_cropped.mp4", cv2.VideoWriter_fourcc(*"mp4v"), fps, (x2-x1, y2-y1))

    while True:
        ok, frame = cap.read()
        if not ok: break
        writer.write(frame[y1:y2, x1:x2])
    cap.release(); writer.release()

def test():
    import cv2
    cap = cv2.VideoCapture("./src/clip_cropped.mp4")
    ret, frame = cap.read()
    cv2.imwrite("frame0.jpg", frame)

def main():
    model = YOLO("yolo11s.pt")
    # model.to("cuda")  
    seen_ids = set()
    last_cy = {}  # tid -> previous cy
    line_y = 190  # y-coordinate of the counting line  
    line_y2 = 60

    results = model.track(source="./src/clip_cropped.mp4"
                          , imgsz=960
                          , conf=0.5
                          , show=True 
                          , classes=[2,3,7] 
                          , iou=0.5
                          , persist=True
                          , tracker="botsort.yaml" 
                          , agnostic_nms=True)

    h_ref = None
    for r in results:
        if r.boxes.id is None:
            continue

        for box, tid, conf in zip(r.boxes.xywh, r.boxes.id.int().tolist(), r.boxes.conf.tolist()):
            cx, cy = box[0].item(), box[1].item()

            if line_y2 <= cy <= line_y and tid not in seen_ids:
                seen_ids.add(tid)
                annotated = r.plot()
                cv2.imwrite(f"car_{tid}.jpg", annotated)
                x, y, w, h = box.tolist()
                # with open(f"car_{tid}.txt", "w") as f:
                #     f.write(f"2 {x} {y} {w} {h} {conf}\n")

    print(f"Total saved: {len(seen_ids)}")
if __name__ == "__main__":
    main()
