paypal.Buttons({
    createOrder: function(){
        return fetch('/create-order',{
            method: "POST",
            headers: {
                "content-type": 'application/json'
            },
            body: JSON.stringify({
                items: [
                    {
                        id: 1,
                        quantity:1 
                    },
                ],
            }),
        }).then(res =>{
            if(res.ok) return res.json()
            return res.json().then(json=>Promise.reject(json))
        }).then(({id}) => {
            return id
        }).catch(err =>{
            console.error(err.error)
        })
    },
    onApprove: function(data,actions){
        fetch('/handle_success', {
            method: 'GET'
          }).then(function(response) {
            if (response.ok) {
              window.location.href = "/handle_success";
            }
          });
            return actions.order.capture().then(function(details){
                window.location.href = "/success";
            });
        
        
    }
}).render('#paypal');