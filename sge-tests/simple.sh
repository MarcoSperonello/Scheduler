#cat simple.sh

#####################################
#$ -S /bin/bash
#$ -e /home/marco/Uni/Tesi/Projects/node-ws-template/sge-tests/err.log
#$ -o /home/marco/Uni/Tesi/Projects/node-ws-template/sge-tests/out.log
#####################################

echo "------------------------------------------------------------------------"
echo "Job started on" `date`
echo "------------------------------------------------------------------------"

#echo -e "this is stdin\nhello world!"
echo "HOME is $HOME"
echo "USER is $USER"
echo "JOB_ID is $JOB_ID"
echo "JOB_NAME is $JOB_NAME"
echo "HOSTNAME is $HOSTNAME"
echo "SGE_TASK_ID is $SGE_TASK_ID"
echo "current pwd is $(pwd)"

if [ -n "${JOB_ID:+1}" ]; then
  echo "$JOB_NAME IS using grid engine"
else
  echo "$0 IS NOT using grid engine"
fi

#echo "parameter 1: $1"
#echo "parameter 2: $2"

# generate some errorrs on stderr
#echo "this is stderr" 1>&2
#rm asdddd

rnd=$(shuf -i 2-5 -n 1)
echo "Sleeping $rnd seconds..."
#sleep $rnd
sleep 10

echo "------------------------------------------------------------------------"
echo "Job ended on" `date`
echo "------------------------------------------------------------------------"
