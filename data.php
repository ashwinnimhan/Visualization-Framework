<?PHP
# this will get the url data from remote servers for the dashboard app

$url;

$params=array();
#
# build the params array from the $_get info passed in
#
foreach ($_GET as $key => $value) {
    #echo "$key:$value:<br>\n";
    if ($key != "source") {
        $params[$key] = $value;
    }
}
#
# build the new parameters string
#
$params_string = http_build_query($params);
#echo "params:$params_string:<br>";
#$params_string = clean($params_string);
#echo "params:$params_string:<br>";


#
# build the new url
#
# check if the source string is there - it is the key
if (array_key_exists("source",$_GET)) {
    # check for the ? to see if there attached params
    if (preg_match('/\?/',$_GET["source"])) {
        # check to see if the new params string is bigger then zero
        if (strlen($params_string) === 0) {
            $url = $_GET["source"];
        }
        else {
            # if ther is a params_string add the &
            $url = $_GET["source"] . '&' .  $params_string;
        }
    }
    else {
        # check to see if the new params string is bigger then zero
        if (strlen($params_string) === 0) {
            $url = $_GET["source"];
        }
        else {
            # if there are parmas we'll need a ? to add them
            $url = $_GET["source"] . '?' . $params_string;
        }
    }
}
else {
    $url = "";
    echo "no source";
}

#echo "url:$url:";
#echo "start:";
echo get_data($url);
#echo ":";
#
# get_data - do a curl to the actual server for the data
#
function get_data($url) {
	$ch = curl_init();
	$timeout = 5;
	curl_setopt($ch, CURLOPT_URL, $url);
	curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
	curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, $timeout);
	$data = curl_exec($ch);
	curl_close($ch);
	return $data;
}
#
# function to clean the html get input
#
function clean($elem) {
    $elem = htmlentities($elem,ENT_QUOTES,"UTF-8");
    return $elem;
}
?>
