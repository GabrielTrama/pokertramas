# PokerTrama

Poker Texas Hold'em para jogar com os amigos, cada um no seu celular. Sem servidor próprio, sem cadastro: quem cria a mesa escolhe um **ID** e uma **senha**, e os amigos entram com os mesmos dados.

## Como jogar

1. Abra o app, escolha seu nome e sua cor (ou uma foto).
2. Quem organiza preenche ID e senha e toca em **Criar mesa** (Torneio ou Cash).
3. Toque no ID no topo para mandar o convite pelo WhatsApp.
4. Os amigos preenchem ID e senha e tocam em **Entrar na mesa**.
5. O anfitrião toca em **Começar o jogo**. As mãos seguintes começam sozinhas.

**Quem criou a mesa precisa manter o app aberto** (a tela fica ligada sozinha): o celular dele é o "dealer".

## Torneio (padrão)

- 20.000 fichas iniciais, 30 s por jogada + 60 s de banco de tempo por torneio.
- Blinds sobem pelo relógio (vale a partir da mão seguinte):

| Nível | Blinds | Ante | Intervalo |
|---|---|---|---|
| 1 | 100 / 200 | 30 | 8 min |
| 2 | 125 / 250 | 35 | 8 min |
| 3 | 150 / 300 | 45 | 8 min |
| 4 | 200 / 400 | 60 | 8 min |
| 5 | 250 / 500 | 75 | 8 min |
| 6 | 300 / 600 | 90 | 8 min |
| 7 | 350 / 700 | 100 | 8 min |
| 8 | 400 / 800 | 120 | 8 min |
| 9 | 500 / 1.000 | 150 | 5 min |
| 10 | 600 / 1.200 | 180 | 5 min |
| 11 | 750 / 1.500 | 200 | 5 min |
| 12+ | 1.000 / 2.000 … | 300 … | 5 min |

- **Reentrada** até o fim do nível 8: quem quebra escolhe "Reentrar" (volta com 20.000) ou "Sair do torneio". O número de reentradas aparece ao lado do nome (↻2). Depois do nível 8, quem quebra é eliminado.
- No fim, pódio com 1º, 2º e 3º e botão "Começar outro torneio".
- Quem chega depois que a reentrada fechou assiste e entra no próximo torneio.
- Em "Fichas e blinds" dá para mudar fichas, blinds iniciais (a tabela acompanha), minutos por nível e até qual nível vale a reentrada (0 = sem reentrada).

## Spin & Gold

Torneio rápido de 2 a 9 jogadores: 500 fichas, blinds 10/20 subindo a cada 3 minutos, sem reentrada. Ao começar, uma roleta sorteia o prêmio do campeão. Ao criar a mesa, o anfitrião escolhe os multiplicadores:
- **Entre amigos**: ×2 (60%), ×3 (25%), ×5 (12%), ×10 (3%)
- **Clássico GG**: ×2 (75%), ×3 (15%), ×5 (6,5%), ×10 (3%), ×25 (0,4%), ×100 (0,09%), ×1000 (0,01%)

## Ranking da temporada

Cada torneio vencido vale 1 ponto (Spin & Gold também), e o ranking zera a cada mês. Fica no lobby e no menu (•••), com os meses anteriores e o botão "Mandar no grupo".
Não precisa de servidor: cada celular guarda os resultados e troca com a mesa quando vocês jogam juntos. Quem faltou numa noite recebe os resultados na próxima vez que entrar numa mesa com alguém que estava.

## Straddle e Bomb pot

Valem no Cash e nos torneios, e o anfitrião liga ou desliga em "Ajustes da mesa".
- **Straddle**: toque no botão "Straddle" (canto direito da mesa). Quando você for o primeiro a falar, põe 2 BB às cegas; a ação começa depois de você e você fala por último no pré-flop. Precisa de pelo menos 3 jogadores.
- **Bomb pot**: todos põem um valor (padrão 2 BB), sem blinds, e a mão começa direto no flop. Acontece a cada 10 mãos (ajustável; 0 = só manual) ou quando o anfitrião chama pelo menu (•••).

## Cash

5.000 fichas iniciais, blinds fixos (100/200), sem ante, recompra quando as fichas acabam.

## Na mesa

- **Ranking**: posição, jogador, fichas e BB de cada um, média da mesa; sua linha fica destacada.
- **BB** no topo: mostra todos os valores em big blinds.
- **Digitar o valor da aposta**: em "Aumentar", toque no número e digite (ex.: 1.350 ou 2k; em BB, 12,5). Abaixo do mínimo o botão trava e mostra o mínimo; acima do máximo vira all-in.
- **All-in com porcentagem**: quando ninguém mais pode apostar, aparece "ALL-IN", as cartas de todos abrem e cada um vê a chance de vitória (%). A mesa vira uma rua de cada vez (flop, turn, river) e as porcentagens se atualizam a cada carta.
- **Caiu a conexão?** Se a tela apagou, você trocou de app ou a internet oscilou, o jogo reconecta sozinho quando você volta. Ficou fora menos de 20 s: nem aparece como offline. Ficou mais (até 10 min): volta para a mesa sozinho, sem tocar no balão. Quem escolheu "Ficar offline" continua offline até tocar no balão.
- **Sua vez em outra aba** (computador): o título da aba pisca "🔔 Sua vez!" e toca um som.
- **Pré-ações**: fora da sua vez, marque "Passar/Desistir", "Passar" ou "Pagar qualquer"; quando a vez chega, o app joga sozinho.
- **Banco de tempo**: quando os 30 s acabam, entra o banco (barra vermelha). Acabou o banco, o jogo passa/desiste por você e você fica **offline** — toque no balão no canto para voltar.
- **Mostrar cartas**: quando todo mundo desiste, quem ganhou pode tocar em "Mostrar minhas cartas".
- **Revelação automática**: quando todos desistem, a mesa mostra a próxima rua que viria (fold no pré-flop → flop; no flop → turn; no turn → river). É só para ver; não muda o resultado.
- **Reações e mensagens** (botão 😄): emojis, frases prontas ou uma mensagem digitada (até 60 letras) aparecem em balão sobre o jogador; as mensagens digitadas ficam no histórico.
- **Sons e animações**: embaralhar, distribuir, fichas indo para o pote e para o vencedor. Dá para desligar o som no menu (•••).
- **Resumo da noite** (menu): maior pote, melhor mão, mãos vencidas, torneios ganhos e reentradas — com botão "Mandar no grupo". Aparece para todos quando o anfitrião encerra a mesa.
- **Estrutura de blinds** (menu): a tabela com o nível atual marcado.

## Gerar o APK (GitHub Actions)

O repositório gera o APK sozinho a cada envio: aba **Actions → Gerar APK →** baixe **PokerTrama-apk** no fim da página.

O arquivo `android-debug.keystore` faz todos os APKs terem a mesma assinatura, então as próximas versões instalam por cima da anterior.

No computador (opcional): `npm install`, `npm run android`, `npm run open` → Build APK no Android Studio.

## Como funciona por baixo

- Os celulares se conectam direto (WebRTC) com o [PeerJS](https://peerjs.com); o servidor público gratuito dele só apresenta os aparelhos.
- O celular do anfitrião embaralha (`crypto`) e manda para cada jogador só as próprias cartas. Tecnicamente o anfitrião poderia ver as cartas de todos.
- Em redes 4G que bloqueiam conexão direta, o PeerJS usa servidores de retransmissão gratuitos. Se alguém não conseguir entrar pelo 4G, testem no Wi-Fi.

## Arquivos

```
www/index.html       o app (abertura, lobby, mesa, ranking, resumo)
www/engine.js        regras do Hold'em, torneio, reentrada (roda no anfitrião)
www/peerjs.min.js    conexão entre celulares
www/logo-mesa.webp   imagem no meio da mesa
test/engine.test.js  testes (npm test)
.github/workflows/   gera o APK e publica o site
```
