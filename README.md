# CSC317TermProject
## Group Members
Joshua Arguello & Myles Yolangco

## Pug-Templates-HW
### GET
#### GET ALL Swords
``` bash
curl http://localhost:3000/api/products
```
#### GET One Sword
``` bash
curl http://localhost:3000/api/products/excalibur
```
#### GET One Sword with spaces
``` bash
curl "http://localhost:3000/api/products/sword%20in%20the%20stone"
```
#### GET sowrd that doesn't exist (404)
``` bash
curl http://localhost:3000/api/products/nosword
```
### HEAD
``` bash
curl -I http://localhost:3000/api/products
```
### POST
``` bash
curl -X POST http://localhost:3000/api/products/add -H "Content-Type: application/json" -d '{"name": "durandal", "swordType": "longsword", "ability": "Unbreakable", "price": 799.99}'
```
### DELETE
``` bash
curl -X DELETE http://localhost:3000/api/products/durandal
```

## Rest-API-HW
### Product Description
We are selling swords that provide the user with different unique abilities.

### Data Model
| Field     | Data Type | Description                                 |
|-----------|-----------|---------------------------------------------|
| name      | string    | Sword name                                  |
| swordType | string    | Type of Sword                               |
| ability   | string    | Ability granted to the wielder by the sword |
| price     | number    | Price in USD                                |

### How to Run
#### Install Dependencies
npm i express && npm i -D nodemon

#### Start server
##### Normal mode
npm start

##### Dev Mode
npm run dev

### Example curl/Postman commands
#### GET
Postman:
GET | http://localhost:3000/

curl:
```bash
curl http://localhost:3000/
curl.exe http://localhost:3000/
```

#### HEAD
Postman:
HEAD | http://localhost:3000/

curl:
```bash
curl -I http://localhost:3000/
curl.exe -I http://localhost:3000/
```

#### GET /:identifier
Postman:
GET | http://localhost:3000/testblade

curl:
```bash
curl http://localhost:3000/excalibur
curl.exe -i http://localhost:3000/testblade
```

#### POST
Postman:
POST | http://localhost:3000/add
body:
```json
{
  "name": "Durandal",
  "swordType": "longsword",
  "ability": "Indestructible",
  "price": 799.99
}
```

curl:
```bash
curl -X POST http://localhost:3000/add -H "Content-Type: application/json" -d '{"name":"Durandal","swordType":"longsword","ability":"indestructible","price":799.99}'
curl.exe -i -X POST "http://localhost:3000/add" \ -H "Content-Type: application/json" \ -d '{\"name\":\"ScimitarOfInvisibility\", \"swordType\":\"scimitar\", \"ability\":\"This sword is invisible, even to the wielder!\", \"price\":499.99}'
```

#### DELETE /:identifier
Postman:
DELETE | http://localhost:3000/testblade

curl:
```bash
curl -X DELETE http://localhost:3000/excalibur
curl.exe -i -X DELETE http://localhost:3000/testblade
```