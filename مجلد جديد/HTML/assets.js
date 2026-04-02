let selec = document.getElementById("fatoraHtmlApi");

const fatoraApi = "https://app.fatora.io/FatoraService/GetPublicItems",
      token = selec.getAttribute( "data-token" ), // get the token from data attr
      div = selec.getAttribute( "data-selector" ); // get the selector where you want to put the html content on from data attr
      



function loadStyle(array,callback){
    var loader = function(href,handler){
        var link = document.createElement('link');
        link.rel  = 'stylesheet';
        link.type = 'text/css';
        link.href = href;
        link.onload = link.onreadystatechange = function(){
            link.onreadystatechange = link.onload = null;
            handler();
        }
        var head = document.getElementsByTagName("head")[0];
        (head || document.body).appendChild( link );
    };
    (function run(){
        if(array.length!=0){
            loader(array.shift(), run);
        }else{
            callback && callback();
        }
    })();
}


loadStyle([
    'http://wixhelper.ibrahim.codes/htmlapi/vendor/bootstrap/css/bootstrap.min.css',
    'http://wixhelper.ibrahim.codes/htmlapi/css/app.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css'
    ],function(){
     
});




function loadScripts(array,callback){
    var loader = function(src,handler){
        var script = document.createElement("script");
        script.src = src;
        script.onload = script.onreadystatechange = function(){
            script.onreadystatechange = script.onload = null;
            handler();
        }
        var head = document.getElementsByTagName("footer")[0];
        (head || document.body).appendChild( script );
    };
    (function run(){
        if(array.length!=0){
            loader(array.shift(), run);
        }else{
            callback && callback();
        }
    })();
}

loadScripts([
   "http://wixhelper.ibrahim.codes/htmlapi/vendor/jquery/jquery.min.js",
   "http://wixhelper.ibrahim.codes/htmlapi/vendor/bootstrap/js/bootstrap.bundle.min.js"
],function(){


   fetch(fatoraApi, {
	  method: 'post',
	  mode:'cors',
	  body: JSON.stringify({ token: token }),
	  headers: {
		"Content-Type": "application/json; charset=utf-8"
	  }
	})
    .then(response => 
        
        response.json()
        
    )
    .then(json => {
       selec.removeAttribute("data-token"); // remove the token from data attr
       selec.removeAttribute("data-selector"); // remove the token from data attr

       for(var i =0; json.items.length > i; i++){ // loop the api response and insert html content 
              
              $(div).append(
                
                 `
                  <div class="col-lg-3 col-md-3 mb-4">
                    <div class="card shadow rounded">
                      <a class="p-image" href="${json.items[i].url}"><img class="card-img-top" src="${json.items[i].image}" alt="${json.items[i].name}"></a>
                      <div class="card-body">
                        <h4 class="card-title">
                          <a class="text-dark" href="${json.items[i].url}">${json.items[i].name}</a>
                        </h4>
                        <div class="rating">
                          <span class="fa fa-star checked"></span>
                          <span class="fa fa-star checked"></span>
                          <span class="fa fa-star checked"></span>
                          <span class="fa fa-star"></span>
                          <span class="fa fa-star"></span>
                        </div>
        
                        <p class="card-text">${json.items[i].Description}</p>
                      </div>
                      <div class="card-footer d-flex justify-content-between align-items-center">
                        <span class="h5 main-color">${json.items[i].price} Riyal</span>
                        <a href="${json.items[i].url}" class="btn  btn-primary float-right"> Buy now </a>
                      </div>
                    </div>
                  </div>
                 
                 `
                    
              );
          } /// You can change this or download this file locally for more customization 
        } 
    );



});




   
