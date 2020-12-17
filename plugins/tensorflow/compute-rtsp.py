import sys
import json


def read_in():
    lines = sys.stdin.readlines()
    return json.loads(lines[0])


def process(data):
    ''' 

    data = {
        'frame': 'Adsfasdfasdf', 
        'rtsp': 'abc'
    }
    
    '''


    return_data = [
        {
            'bbox': [
                210.29292678833008,
                121.9500732421875,
                230.34585571289062,
                154.85707092285156,
            ],
            'class': '-',
            'score': 0.83622145652771
        },

        {
            'bbox': [
                10.29292678833008,
                121.9500732421875,
                230.34585571289062,
                154.85707092285156,
            ],
            'class': 'ject',
            'score': 0.83622145652771
        }
    ]

    return return_data
    





    # return data in dict 
    '''
        return data = {
            data : [
                boubdary co-ordinates
            ],
            
        }
    '''

def send_data(data):
    json_data = json.dumps(data)
    print(json_data)

def main():
    data = read_in()
    return_value = process(data)
    send_data(return_value)
    



if __name__ == "__main__":
    main()
