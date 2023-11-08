//a class for making button objects
class Button {
  float xPosition;
  float yPosition;
  float w;
  float h;
  color normal;
  color mouseOver;
  color mouseDown;
  color disabled;

  //the constructor
  Button(float tempX, float tempY, float tempW, float tempH, color tempColor) {
    xPosition = tempX;
    yPosition = tempY;
    w = tempW;
    h = tempH;
    normal = tempColor;

    //this is some scary-looking code which is just getting hold of the
    //R, G, B, and A channels of our color, because the primitive type
    //color doesn't have r, g, b, a properties you can address directly
    //we're using bitshifting to grab the 4 bytes of the color
    int r = (tempColor >> 16) & 0xFF; //bitshift ">>" to get the red channel
    int g = (tempColor >> 8) & 0xFF;  //bitshift ">>" to get the green channel
    int b = tempColor & 0xFF;         //bitshift ">>" to get the blue channel
    //we're doing this so we can add white/brightness to whatvever
    //color the button has been set, for our mouseOver effect
    mouseOver = color(r + 100, g + 100, b + 100);
    mouseDown = color(r + 150, g + 150, b + 150);
    disabled = color(r - 100, g - 100, b - 100);
  }

  //a function to draw the button
  void show(boolean isEnabled, float xOffset, float yOffset) {
    //choose a color: if there's no stock left, make it dark and ignore mouseOver
    //if there's stock left, set the color based on mouse interaction
    if (!isEnabled) {
      fill(disabled);
    } else {
      //set the color based on mouse position and click
      if (mouseIsOver()) {
        if (mousePressed) {
          fill(mouseDown);
        } else {
          fill(mouseOver);
        }
      } else {
        fill(normal);
      }
    }
    rect(xPosition + xOffset, yPosition + yOffset, w, h);
  }


  //a function the check if the mouse is currently over this button
  //returns true if the mouse is over the button
  //returns false if the mouse is not over the button
  boolean mouseIsOver() {
    return (mouseX > xPosition && mouseX < xPosition + w && mouseY > yPosition && mouseY < yPosition + h);
  }
}
