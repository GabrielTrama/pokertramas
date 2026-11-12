# PokerTramaS

Poker Texas Hold'em No-Limit para jogar com os amigos, cada um no seu celular, de qualquer lugar. Sem servidor próprio, sem cadastro e sem cartão: quem cria a mesa escolhe um **ID** e uma **senha**, e os amigos entram com os mesmos dados.

## Como jogar

1. Quem vai organizar abre o app, preenche nome, ID da mesa (ex.: `TRAMAS`) e senha, e toca em **Criar mesa**. Em "Fichas e blinds da mesa nova" dá para mudar fichas iniciais, small blind, big blind e recompra.
2. Toque no ID da mesa, no topo, para mandar o convite com ID e senha pelo WhatsApp.
3. Os amigos abrem o app, preenchem nome, ID e senha, e tocam em **Entrar na mesa**.
4. Com 2 ou mais na mesa, o anfitrião toca em **Começar o jogo**. As mãos seguintes começam sozinhas.

**Quem criou a mesa precisa manter o app aberto** (a tela fica ligada sozinha). O celular dele é o "dealer": embaralha, guarda o baralho e manda para cada amigo só as cartas dele.

## Regras da mesa

- 2 a 9 jogadores; desistir, passar, pagar, aumentar (atalhos: mínimo, ½ pote, pote, all-in)
- Potes paralelos, divisão em empate e devolução de aposta que ninguém pagou
- **30 segundos por jogada.** Se acabar, o jogo passa (quando dá) ou desiste, e o jogador fica **offline**. Aparece um balão no canto da mesa: tocando nele, volta para a mesa. Offline não entra nas próximas mãos.
- Quem fecha o app ou perde a conexão também fica offline. Ao abrir de novo, o ID e a senha já vêm preenchidos.
- **Fichas / BB**: no topo, escolha ver os valores em fichas ou em big blinds (ex.: 1.000 fichas com BB 20 = 50 BB). É uma preferência de cada aparelho.
- Recompra quando as fichas acabam, placar com saldo, histórico e opção do anfitrião remover alguém.
- Se o app do anfitrião fechar, ao abrir aparece **Reabrir a mesa**: a partida volta de onde parou e os amigos reconectam sozinhos.

## Gerar o APK

### Opção A — sem instalar nada (GitHub Actions)
1. Crie um repositório no GitHub e envie esta pasta inteira (inclusive a pasta `.github`).
2. Na aba **Actions**, abra "Gerar APK" e clique em **Run workflow** (ele também roda a cada envio na `main`).
3. Quando terminar (~5 min), baixe `PokerTramaS-apk` no final da página da execução. Dentro está o `app-debug.apk`.
4. Mande o APK para os amigos e instalem (o Android pede para permitir "fontes desconhecidas").

### Opção B — no seu computador (Android Studio)
Precisa de Node 22, Java 21 e Android Studio.
```bash
npm install
npm run android      # cria a pasta android/, ícones e copia o app
npm run open         # abre no Android Studio → Build → Build APK(s)
```
Depois de mudar algo em `www/`, rode `npm run sync`.

### Opção C — sem APK
Hospede a pasta `www/` em qualquer lugar com HTTPS (Firebase Hosting no plano grátis, GitHub Pages, Netlify). Abrindo no Chrome do celular, toque em "Adicionar à tela inicial" e funciona igual a um app.

## Como funciona por baixo

- Os celulares se conectam direto entre si (WebRTC) usando o [PeerJS](https://peerjs.com). O servidor público gratuito do PeerJS só "apresenta" os aparelhos; as jogadas não passam por ele.
- O ID da mesa vira o endereço do anfitrião (`pokertramas-v1-<id>`). Os IDs são compartilhados com o mundo todo, então escolha algo único (`TRAMAS-SOROCABA` é melhor que `MESA1`).
- A senha é conferida no celular do anfitrião; a conexão entre os aparelhos é criptografada.
- Cada jogador só recebe as próprias cartas e o estado público da mesa. As cartas dos outros só aparecem no showdown. Como o anfitrião é o dealer, tecnicamente ele poderia ver as cartas de todos pelo modo desenvolvedor — é o preço de não ter servidor.
- Em redes de celular que bloqueiam conexão direta, o PeerJS usa os servidores de retransmissão (TURN) gratuitos dele. Se algum amigo não conseguir entrar pelo 4G, teste no Wi-Fi.

### Usar um servidor seu (opcional)
Se o servidor público do PeerJS ficar instável, dá para subir o seu (`npm i peer` e `npx peerjs --port 9000`) e apontar em `PEER_SERVER` no começo do script de `www/index.html`.

## Arquivos

```
pokertramas/
├── www/
│   ├── index.html         o app (abertura, lobby, mesa, conexão)
│   ├── engine.js          regras do Hold'em (roda no celular do anfitrião)
│   ├── peerjs.min.js      conexão entre celulares (embutido, funciona offline no APK)
│   ├── fonts/, ícones, manifest, sw.js
├── test/engine.test.js    testes das regras (npm test)
├── assets/logo.png        ícone do app Android
├── capacitor.config.json  configuração do APK
└── .github/workflows/apk.yml   gera o APK no GitHub
```

## Ajustes rápidos (em `www/engine.js`)

- `DEFAULT_SETTINGS.turnSeconds` — tempo por jogada (30)
- `NEXT_HAND_DELAY_MS` — pausa entre mãos (7 s)
- `MAX_SEATS` — lugares na mesa (9)
