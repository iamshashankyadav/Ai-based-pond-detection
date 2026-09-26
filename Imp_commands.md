### ssh login in terminal
>ssh -p 2201 student@10.1.75.79

>ssh -p 2202 student@10.1.75.79

>ssh -p 2203 student@10.1.75.79

>ssh -p 2204 student@10.1.75.79

### see background process running 
>ps aux | grep -E "lb-linux|python"

>ps aux | grep -E "lb-linux|python"

>ps aux | grep "python" | grep -v "grep"

>ps aux | grep "python"

### run a script in background
> nohup python -u app.py > server.log 2>&1 &

>nohup ./lb-linux --port 4000 --backends "http://10.1.75.79:3201,http://10.1.75.79:3202,http://10.1.75.79:3203,http://10.1.75.79:3204" --threshold 150.0 > lb.log 2>&1 &

### kill a process background 
>sudo kill -9 PID