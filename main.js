var express = require('express');
var http = require('http');
var session = require('express-session')
var socketio = require('socket.io')
var fs = require('fs');
var ejs = require('ejs');
var bodyParser = require('body-parser')
var mysql = require('mysql');
var mysqlStore = require('express-mysql-session')(session);
var crypto = require('crypto');

//MySql 정보 변수 Options
var options={
	host: "localhost",
	user: 'root',
	password: '',
	database: 'YKS'

}
//서버 생성
//바디 파서 사용
//MysqlDB 연결
//세션 저장소(Mysql) 연결
var app = express();
var server = http.createServer(app);


app.use(bodyParser.urlencoded({ extended : false}));
var client = mysql.createConnection(options);
var sessionStore = new mysqlStore(options);

//세션저장 정보 설정
var session = session({
	secret: '!CeCre@misS0d!!isious.',
	store: sessionStore,
	resave: false,
	saveUninitialized: false
})

app.use(session);

//초기 접근시 로그인페이지로 인계
//이미 로그인된 상태면 user페이지로 인계
app.get('/', function(request,response){
	if(request.session.owner){
		response.redirect('/user');
	}else{
		response.redirect('/login');
	}
});

//가입페이지를 불러온다.
app.get('/register', function(request,response){

	fs.readFile('RegisterPage.html','utf8',function(error,data){
		response.send(data);
	});

});

//userid와 password를 입력받아 회원가입한다. 패스워드는 간단하게 암호화 후 저장하고, 중복된 id면 가입시키지 않는다.
app.post('/register', function(request,response){
	var body = request.body;
	var userid = request.body.id;
	var pw = request.body.password;
	var nickname = request.body.nickname;
	var name = request.body.name;
	var email = request.body.email;
	var phone_number = request.body.phone_number;

	var c_pw = crypto.createHash('sha256').update(pw).digest('hex');
	
	client.query('INSERT INTO user (userid, password, nickname, name, email, phone_number) SELECT ?,?,?,?,?,? FROM dual WHERE NOT EXISTS (SELECT * FROM user WHERE userid=? or nickname=?)',[userid, c_pw, nickname, name, email, phone_number, userid, nickname],function(error){
		response.redirect('/login');
		console.log(error);
		console.log('되긴하나?');
	});

});

//로그인페이지를 불러온다.
//이미 로그인된 상태면 user페이지 인계
app.get('/login', function(request,response){
	if(request.session.owner){
		response.redirect('/user');
	}else{
		fs.readFile('LoginPage.html', 'utf8', function(error,data){
			response.send(data);
		});
	}
});

//비밀번호를 암호화해서 DB에 저장된 비밀번호와 비교한다.
//일치하면 세션에 userid를 포함시키고 user페이지로 인계한다.
//로그인이 실패하면 로그인페이지를 리셋시킨다.
app.post('/login', function(request,response){
	var userid = request.body.id;
	var pw = request.body.password;

	var c_pw = crypto.createHash('sha256').update(pw).digest('hex');

	client.query('SELECT * FROM user where userid = ? and password = ?', [userid, c_pw], function(error,results){
		if(results[0]){
			request.session.owner = results[0]['userid'];
			request.session.save(function(){
				response.redirect('/user');
			});
			
		}else{
			response.redirect('/login');
		}
	});

});

//연락처페이지를 불러온 후 세션에 연결된 계정의 데이터를 불러온다.
//데이터를 ejs로 전달한다.
//세션이 없으면 403페이지를 출력한다.
app.get('/user', function(request,response){
	if(request.session.owner){
		fs.readFile('ContactPage.html','utf8',function(error,data){
			client.query('SELECT * FROM address where owner = ?',[request.session.owner], function(error, results){
				response.send(ejs.render(data,{
					title: request.session.owner,
					data: results
				}));
			});
		});
	}else{
		response.sendStatus(403);
	}
});

//채팅메인페이지를 불러온 후 사용자가 가진 채팅방 목록을 출력한다.
//데이터를 ejs로 data1(리스트),data2(채팅창)을 전달한다. 이때 data2는 리스트를 선택하지 않았으니 더미데이터를 뿌린다.
//세션이 없으면 403페이지를 출력한다.
app.get('/chat', function(request,response){
	if(request.session.owner){
		fs.readFile('Chat.html', 'utf8', function(error,data){
			client.query('select * from messages where (roomidx,datedata) in (select roomidx,max(datedata) from messages where(roomidx) in (select roomidx from chatRoomAttendant where userid= ? ) group by roomidx)', [request.session.owner],function(error,results){
				client.query('select * from messages where roomidx= ?', 0 ,function(error,results2){
					response.send(ejs.render(data,{
						data1: results,
						data2: results2
					}));
				});
			});
		});
	}else{
		response.sendStatus(403);
	}
});

//채팅메인페이지를 불러온 후 사용자가 가진 채팅방 목록과 방의 대화내용을 출력한다.
//채팅페이지에서 리스트를 클릭하면 해당 리스트의 방번호를 인자로 받는다.
//채팅방에서 내가 보낸 메시지는 오른쪽에 표기하기 위해 ejs로 owner데이터(nickname)를 추가로 보낸다.
//세션이 없으면 403페이지를 출력한다.
app.get('/chat/:roomidx', function(request,response){
	if(request.session.owner){
		fs.readFile('Chat.html', 'utf8', function(error,data){
			client.query('select nickname from user where userid=?',request.session.owner,function(error,nickname){
				client.query('select * from messages where (roomidx,datedata) in (select roomidx,max(datedata) from messages where(roomidx) in (select roomidx from chatRoomAttendant where userid= ? ) group by roomidx)', [request.session.owner],function(error,results){
					client.query('select * from messages where roomidx= ?', request.params.roomidx ,function(error,results2){	
						request.session.roomidx=request.params.roomidx;
						nickname=nickname[0]['nickname'];
						request.session.save(function(){
							response.send(ejs.render(data,{
								data1: results,
								data2: results2,
								owner: nickname
							}));
						});
					});
				});
			});
		});
	}else{
		response.sendStatus(403);
	}
});

//연락처에서 채팅버튼을 눌렀을시 연결되는 코드이다.
//채팅할 대상이 웹사이트에 존재하는 계정이면 채팅을 시작하고, 없으면 UserNotRegist페이지를 출력한다.
//계정은 존재하지만 이전에 대화했던 기록이 없으면 새로운 방을 만들고 참여자 2명을 참여시킨다.
//방코드는 99999999~100000000사이의 값이 랜덤으로 정해진다.
//쿼리 코드는 방생성->참석자A참여->참석자B참여로 이루어진다.
app.get('/chatting/:nickname', function(request,response){
	if(request.session.owner){
		client.query('select userid from user where nickname=?',request.params.nickname,function(error,userid2){
			
			if(userid2[0]){
			var user=userid2[0]['userid'];

				client.query('SELECT a.roomidx from chatRoomAttendant a inner join chatRoomAttendant b on a.roomidx = b.roomidx and b.userid=? where a.userid=?',[request.session.owner,user],function(error,result){
					if(result[0]){
						response.redirect('/chat/'+result[0]['roomidx']);
					}else{
						var roomCode = Math.floor(Math.random() * (1000000000 - 99999999)) + 99999999;
						client.query('insert into chatRoom(roomidx) values(?)',roomCode,function(error,create){
							client.query('insert into chatRoomAttendant(roomidx,userid) values(?,?);', [roomCode, request.session.owner],function(error,joinuser1){
								client.query('insert into chatRoomAttendant(roomidx,userid) values(?,?);', [roomCode, user],function(error,joinuser2){
									response.redirect('/chat/'+roomCode);
								});
							});
						});
					}
				});
			}else{
				fs.readFile('usernotregist.html', 'utf8', function(error,data){
					response.send(data);
				});
			}
		});
	}else{
		response.sendStatus(403);
	}
});

//로그아웃 기능이다. 세션을 파괴한 후 메인으로 복귀시킨다.(/login 페이지로 이동됨)
app.get('/user/logout', function(request,response){
	request.session.destroy(function(err){
		response.redirect('/');
	});
});

//로그인 한 사용자만 연락처추가페이지를 전달한다.
//세션이 없으면 403페이지를 출력한다.
app.get('/user/insert', function(request,response){
	if(request.session.owner){
		fs.readFile('InsertPage.html','utf8',function(error,data){
			response.send(data);
		});
	}else{
		response.sendStatus(403);
	}
});

//연락처추가페이지에서 전달받은 데이터를 DB에 저장한다.
//세션의 owner를 통해 누구의 데이터인지도 같이 저장한다.
//세션이 없으면 403페이지를 출력한다.
app.post('/user/insert', function(request,response){
	if(request.session.owner){
		var body = request.body;
	
		client.query('INSERT INTO address (nickname, phone_number, email, owner) VALUES (?,?,?,?)',
		[body.name, body.phone_number, body.email, request.session.owner],function(error){
			response.redirect('/user');
			console.log('되긴함?');
		});
	}else{
		response.sendStatus(403);
	}
});

//수정 페이지를 불러 온 후 수정할 데이터를 ejs로 전달한다.
//연락처 수정의 id는 address 테이블의 통합 id를 사용한다.
//세션이 없으면 403페이지를 출력한다.
app.get('/user/edit/:id', function(request,response){
	if(request.session.owner){
		fs.readFile('edit.html', 'utf8', function(error,data){
			client.query('SELECT * FROM address where id = ?',[request.params.id],function(error, result){
				response.send(ejs.render(data,{
					data: result[0]
				}));
			});	
		});
	}else{
		response.sendStatus(403);
	}
});

//수정 페이지에서 전달받은 데이터를 DB에 수정하여 저장한다.
//세션이 없으면 403페이지를 출력한다.
app.post('/user/edit/:id', function(request,response){
	if(request.session.owner){
		var body = request.body;
	
		client.query('UPDATE address SET nickname=?, phone_number=?, email=? WHERE id=? and owner=?',[body.name, body.phone_number, body.email, request.params.id,request.session.owner],function(){
			response.redirect('/user');	
		});
	}else{
		response.sendStatus(403);
	}
});

//address 테이블의 통합 id를 사용해서 게시물을 삭제한다.
app.get('/user/delete/:id', function(request,response){
	if(request.session.owner){
		client.query('DELETE FROM address WHERE id=? and owner=?', [request.params.id, request.session.owner], function(){
			response.redirect('/user');
		});
	}else{
		response.sendStatus(403);
	}
});

server.listen(52273, function(){
	console.log('App running at http:127.0.0.1:52273/');
});

var ios = require('express-socket.io-session');//소켓서버와 세션을 연결하는 모듈
var io = socketio.listen(server);

io.use(ios(session,{autoSave:true}));//소켓과 세션 연결
//XSS스크립트 방지책 위험요소를 HTML엔티티로 적용시킨다.
var entityMap = { 
            '&': '&amp;','<': '&lt;', '>': '&gt;',
             '"': '&quot;', "'": '&#39;', '/': '&#x2F;',
              '`': '&#x60;', '=': '&#x3D;' };

function escapeHtml (string) {
    return String(string).replace(/[&<>"'`=\/]/g, function (s) {
         return entityMap[s]; 
    }); 
}

io.sockets.on('connection', function(socket){
	socket.on('message', function(data){
		name=socket.handshake.session.owner;
		roomCode=socket.handshake.session.roomidx;


		//데이터 초과시 처리
		if(data.message.length>1000){
			data.message = data.message.substring(0,1000);
		}
		data.message = escapeHtml(data.message);

		console.log(data.message);

		//메시지를 입력하지 않고 ENTER 입력시 무시
		if(roomCode && data.message.length!=0){
			socket.join(roomCode);
			client.query('select nickname from user where userid=?', name, function(error,nickname){
				nickname2=nickname[0]['nickname'];
				//전달되는 메시지 데이터를 DB에 저장한다.
				client.query('insert into messages (roomidx, datedata, sender, message) SELECT ?,?,?,? FROM dual WHERE NOT EXISTS (SELECT * FROM messages WHERE datedata=? and sender=? and message=?)'
,[roomCode, data.date, nickname2, data.message, data.date, nickname2, data.message]);
				io.sockets.in(roomCode).emit('message',{
					name: nickname2,
					message: data.message,
					date: data.date,
					sid: socket.id,
					roomCode: roomCode
				});
			});
			
		}else{
			//Dummy
		}

		
	});

	socket.on('getListRequest', function(data){
		io.sockets.emit('getList');
	});
});