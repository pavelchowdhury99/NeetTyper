#!/usr/bin/env python3
"""
Script to keep the mouse cursor revolving in a circular pattern.
Useful for preventing screen savers or keeping the system active.
"""

import math
import time
import argparse
try:
    import pyautogui
except ImportError:
    print("Error: pyautogui is not installed.")
    print("Please install it using: pip install pyautogui")
    exit(1)


def revolve_cursor(radius=100, speed=0.01, duration=None, center=None):
    """
    Move the cursor in a circular pattern.
    
    Args:
        radius: Radius of the circle in pixels (default: 100)
        speed: Time delay between movements in seconds (default: 0.01)
        duration: Total duration to run in seconds (None = infinite)
        center: Tuple of (x, y) for center position (None = current position)
    """
    pyautogui.FAILSAFE = True
    
    if center is None:
        center_x, center_y = pyautogui.position()
    else:
        center_x, center_y = center
    
    print(f"Starting cursor revolution...")
    print(f"Center: ({center_x}, {center_y})")
    print(f"Radius: {radius} pixels")
    print(f"Speed: {speed} seconds per step")
    print(f"Duration: {'Infinite (Ctrl+C to stop)' if duration is None else f'{duration} seconds'}")
    print(f"\nMove mouse to corner to emergency stop (PyAutoGUI FAILSAFE)")
    print("-" * 50)
    
    start_time = time.time()
    angle = 0
    
    try:
        while True:
            if duration is not None and (time.time() - start_time) >= duration:
                print("\nDuration reached. Stopping...")
                break
            
            x = center_x + radius * math.cos(angle)
            y = center_y + radius * math.sin(angle)
            
            pyautogui.moveTo(x, y, duration=0)
            
            angle += 0.1
            if angle >= 2 * math.pi:
                angle = 0
            
            time.sleep(speed)
            
    except KeyboardInterrupt:
        print("\n\nStopped by user (Ctrl+C)")
    except pyautogui.FailSafeException:
        print("\n\nEmergency stop activated (mouse moved to corner)")
    finally:
        print("Cursor revolution stopped.")


def main():
    parser = argparse.ArgumentParser(
        description="Keep the mouse cursor revolving in a circular pattern"
    )
    parser.add_argument(
        "-r", "--radius",
        type=int,
        default=100,
        help="Radius of the circle in pixels (default: 100)"
    )
    parser.add_argument(
        "-s", "--speed",
        type=float,
        default=0.01,
        help="Time delay between movements in seconds (default: 0.01)"
    )
    parser.add_argument(
        "-d", "--duration",
        type=int,
        default=None,
        help="Duration to run in seconds (default: infinite)"
    )
    parser.add_argument(
        "-c", "--center",
        nargs=2,
        type=int,
        metavar=("X", "Y"),
        help="Center position as X Y coordinates (default: current cursor position)"
    )
    
    args = parser.parse_args()
    
    center = tuple(args.center) if args.center else None
    
    revolve_cursor(
        radius=args.radius,
        speed=args.speed,
        duration=args.duration,
        center=center
    )


if __name__ == "__main__":
    main()
