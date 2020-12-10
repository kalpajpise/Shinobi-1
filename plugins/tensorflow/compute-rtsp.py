import json
import sys 
import cv2 as cv 


rtsp_arr = list()

def read_in():
    lines = sys.stdin.readlines()
    return json.loads(lines[0])



def check(rtsp : str):
    if rtsp in rtsp_arr :
        return False
    
    else :
        rtsp_arr.append(rtsp)
        return True

    

def video_process(rtsp : str):

    try  :

        cap = cv.VideoCapture(rtsp)

        if (cap.isOpened()== False):  
            print("Error opening video  file") 

        # while(cap.isOpened()): 

        #     ret, frame = cap.read() 
        #     if ret == True: 
            
            
        #         cv.imshow('Frame', frame) 

        #         if cv.waitKey(25) & 0xFF == ord('q'): 
        #             break
            
        #     else:  
        #         break
        

        # cap.release() 
        # cap.destroyAllWindows()
        
    except Exception as e :
        print(e)



def main():
    
    rtsp = read_in()
    print(rtsp)

    # if check(rtsp) :
    #     video_process(rtsp)

    print(0,54)


if __name__ == "__main__":
    main()
